import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as zlib from "zlib";
import * as stream from "stream";
import * as crypto from "crypto";

import {
  ServerSettings,
  ReduxClusterStore,
  ClusterMessage,
  MessageType,
  ClusterSocket,
} from "../types";
import { hasher } from "../utils/crypto";

export class ClusterServer {
  public readonly uid: string;
  public readonly sockets: Record<string, ClusterSocket> = {};
  public readonly database: Record<string, string> = {};
  public readonly ip2ban: Record<string, { time: number; count: number }> = {};

  private readonly ip2banTimeout = 10800000; // 3 hours
  private readonly ip2banGC: NodeJS.Timeout;
  private server: net.Server;
  private unsubscribe?: () => void;
  private shouldAutoRestart: boolean = true;

  constructor(
    private store: ReduxClusterStore,
    private settings: ServerSettings = {}
  ) {
    this.uid = crypto.randomUUID();
    this.setupDatabase();
    this.setupBanSystem();
    this.setupServer();
    this.setupStoreIntegration();

    this.ip2banGC = setInterval(() => {
      this.cleanupBannedIPs();
    }, 60000);
  }

  private setupDatabase(): void {
    if (this.settings.logins) {
      for (const login in this.settings.logins) {
        const hashedLogin = hasher(`REDUX_CLUSTER${login}`);
        const hashedPassword = hasher(
          `REDUX_CLUSTER${this.settings.logins[login]}`
        );
        if (hashedLogin && hashedPassword) {
          this.database[hashedLogin] = hashedPassword;
        }
      }
    }
  }

  private setupBanSystem(): void {
    // IP ban system is initialized in constructor
  }

  private cleanupBannedIPs(): void {
    const now = Date.now();
    for (const key in this.ip2ban) {
      if (this.ip2ban[key].time + this.ip2banTimeout < now) {
        delete this.ip2ban[key];
      }
    }
  }

  private setupServer(): void {
    const listenOptions = this.getListenOptions();

    this.server = net.createServer((socket) => {
      this.handleNewConnection(socket);
    });

    this.server.on("listening", () => {
      this.store.connected = true;
      this.store.sendtoall({
        _msg: MessageType.CONN_STATUS,
        _hash: this.store.RCHash,
        _connected: true,
      });
    });

    this.server.on("close", () => {
      this.store.connected = false;
      this.store.sendtoall({
        _msg: MessageType.CONN_STATUS,
        _hash: this.store.RCHash,
        _connected: false,
      });

      this.cleanup();

      // Auto-restart server after 10 seconds
      if (this.shouldAutoRestart) {
        setTimeout(() => {
          new ClusterServer(this.store, this.settings);
        }, 10000);
      }
    });

    this.server.on("error", (err) => {
      this.store.stderr(
        `ReduxCluster.createServer socket error: ${err.message}`
      );
      if (typeof this.server.close === "function") {
        this.server.close();
      }
    });

    this.startListening(listenOptions);
  }

  private getListenOptions(): any {
    const defaultOptions: any = { port: 10001 };

    if (typeof this.settings.path === "string") {
      switch (os.platform()) {
        case "win32":
          return { path: path.join("\\\\?\\pipe", this.settings.path) };
        default:
          return { path: path.join(this.settings.path) };
      }
    }

    const options: any = { ...defaultOptions };
    if (typeof this.settings.host === "string") {
      options.host = this.settings.host;
    }
    if (typeof this.settings.port === "number") {
      options.port = this.settings.port;
    }

    return options;
  }

  private startListening(options: any): void {
    if (typeof options.path === "string") {
      // Remove existing socket file
      fs.unlink(options.path, (err) => {
        if (
          err &&
          !err.message.toLowerCase().includes("no such file or directory")
        ) {
          this.store.stderr(
            `ReduxCluster.createServer socket error: ${err.message}`
          );
        }
        this.server.listen(options);
      });
    } else {
      this.server.listen(options);
    }
  }

  private handleNewConnection(socket: net.Socket): void {
    // Hash IP address for security using hasher function
    const clientIP = socket.remoteAddress ? hasher(socket.remoteAddress) : "";
    const uid = crypto.randomUUID();

    const clusterSocket = socket as any as ClusterSocket;
    clusterSocket.uid = uid;

    // Check if IP is banned
    if (this.isIPBanned(clientIP)) {
      this.rejectConnection(clusterSocket, true);
      return;
    }

    this.setupSocket(clusterSocket, clientIP);
  }

  private isIPBanned(ip?: string): boolean {
    if (!ip || !this.ip2ban[ip]) return false;

    const banInfo = this.ip2ban[ip];
    const now = Date.now();

    return banInfo.count >= 5 && banInfo.time + this.ip2banTimeout > now;
  }

  private rejectConnection(socket: ClusterSocket, banned = false): void {
    // Create rejection message
    const rejectionMessage = {
      _msg: MessageType.SOCKET_AUTH_STATE,
      _hash: this.store.RCHash,
      _value: false,
      ...(banned && { _banned: true }),
    };

    // Manually serialize and compress since custom write is not set up yet
    try {
      const compressed = zlib.gzipSync(
        Buffer.from(JSON.stringify(rejectionMessage))
      );
      // Use the native write method directly, not the overridden one
      const originalWrite =
        (socket as any).writeNEW || socket.write.bind(socket);
      originalWrite(compressed);
    } catch (err: any) {
      this.store.stderr(`ReduxCluster.rejectConnection error: ${err.message}`);
    }

    this.closeSocket(socket);
  }

  private setupSocket(socket: ClusterSocket, clientIP?: string): void {
    // Override write method for object mode + compression
    socket.writeNEW = socket.write;
    socket.write = (data: any): boolean => {
      try {
        const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
        return socket.writeNEW(compressed);
      } catch (err: any) {
        this.store.stderr(
          `ReduxCluster.createServer write error: ${err.message}`
        );
        return false;
      }
    };

    socket.on("error", (err) => {
      this.store.stderr(
        `ReduxCluster.createServer client error: ${err.message}`
      );
      this.closeSocket(socket);
    });

    this.setupSocketPipeline(socket, clientIP);
  }

  private setupSocketPipeline(socket: ClusterSocket, clientIP?: string): void {
    // Create processing pipeline
    const mbstring = new stream.Transform({
      transform(
        buffer: any,
        encoding: string,
        callback: (error?: Error | null) => void
      ) {
        this.push(buffer);
        callback();
      },
    });
    mbstring.setEncoding("utf8");

    const gunzipper = zlib.createGunzip();

    // For now, we'll create a simple parser instead of using external library
    const parser = new stream.Transform({
      transform(
        chunk: any,
        encoding: string,
        callback: (error?: Error | null) => void
      ) {
        try {
          const data = JSON.parse(chunk.toString());
          this.push(data);
        } catch {
          // Invalid JSON, ignore
        }
        callback();
      },
      objectMode: true,
    });

    const eventHandler = new stream.Writable({
      write: (
        data: any,
        encoding: string,
        callback: (error?: Error | null) => void
      ) => {
        this.handleSocketMessage(data, socket, clientIP);
        callback();
      },
      objectMode: true,
    });

    // Setup error handlers
    [gunzipper, mbstring, parser, eventHandler].forEach((stream) => {
      stream.on("error", (err) => {
        this.store.stderr(
          `ReduxCluster.createServer stream error: ${err.message}`
        );
      });
    });

    // Connect pipeline
    socket.pipe(gunzipper).pipe(mbstring).pipe(parser).pipe(eventHandler);
  }

  private handleSocketMessage(
    data: any,
    socket: ClusterSocket,
    clientIP?: string
  ): void {
    if (data._hash !== this.store.RCHash) return;

    switch (data._msg) {
      case MessageType.MSG_TO_MASTER:
        if (this.sockets[socket.uid]) {
          if (
            data._action.type === MessageType.SYNC &&
            !data._action._internal
          ) {
            throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
          }
          // Apply action to server state
          // This will automatically trigger sendActionsToNodes via reducer
          this.store.dispatch(data._action);
        }
        break;

      case MessageType.START:
        if (this.sockets[socket.uid]) {
          socket.write({
            _msg: MessageType.MSG_TO_WORKER,
            _hash: this.store.RCHash,
            _action: {
              type: MessageType.SYNC,
              payload: this.store.getState(),
              _internal: true,
            },
          });
        }
        break;

      case MessageType.SOCKET_AUTH:
        this.handleAuthentication(data, socket, clientIP);
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }

  private handleAuthentication(
    data: any,
    socket: ClusterSocket,
    clientIP?: string
  ): void {
    const { _login, _password } = data;

    // If no authentication is configured (empty database), allow all connections
    if (Object.keys(this.database).length === 0) {
      // No authentication required
      this.sockets[socket.uid] = socket;

      socket.write({
        _msg: MessageType.SOCKET_AUTH_STATE,
        _hash: this.store.RCHash,
        _value: true,
      });
      return;
    }

    if (
      typeof _login !== "undefined" &&
      typeof _password !== "undefined" &&
      typeof this.database[_login] !== "undefined" &&
      this.database[_login] === _password
    ) {
      // Successful authentication
      this.sockets[socket.uid] = socket;

      // Clear ban if exists
      if (clientIP && this.ip2ban[clientIP]) {
        delete this.ip2ban[clientIP];
      }

      // Use the custom write method that should be set up by now
      socket.write({
        _msg: MessageType.SOCKET_AUTH_STATE,
        _hash: this.store.RCHash,
        _value: true,
      });
    } else {
      // Failed authentication
      if (clientIP) {
        this.recordFailedLogin(clientIP);
      }

      // Use the custom write method that should be set up by now
      socket.write({
        _msg: MessageType.SOCKET_AUTH_STATE,
        _hash: this.store.RCHash,
        _value: false,
      });

      this.closeSocket(socket);
    }
  }

  private recordFailedLogin(ip: string): void {
    let count = 0;
    if (this.ip2ban[ip]) {
      count = this.ip2ban[ip].count;
      if (count >= 5) count = 0; // Reset on timeout
    }

    this.ip2ban[ip] = {
      time: Date.now(),
      count: count + 1,
    };
  }

  private closeSocket(socket: ClusterSocket): void {
    if (typeof socket.end === "function") {
      socket.end();
    }
    if (socket.uid && this.sockets[socket.uid]) {
      delete this.sockets[socket.uid];
    }
  }

  private setupStoreIntegration(): void {
    // Register with store if in action mode
    if (this.store.mode === "action") {
      (this.store as any).allsock[this.uid] = this;
    }

    // Subscribe to store changes in snapshot mode
    this.unsubscribe = this.store.subscribe(() => {
      if (this.store.mode === "snapshot") {
        this.sendtoall();
      }
    });
  }

  public sendtoall(message?: ClusterMessage): void {
    const msg = message || {
      _msg: MessageType.MSG_TO_WORKER,
      _hash: this.store.RCHash,
      _action: {
        type: MessageType.SYNC,
        payload: this.store.getState(),
        _internal: true,
      },
    };

    for (const uid in this.sockets) {
      this.sockets[uid].write(msg);
    }
  }

  public ip2banGCStop(): void {
    clearInterval(this.ip2banGC);
  }

  private cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.ip2banGCStop();
    delete (this.store as any).allsock[this.uid];
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      // Prevent the automatic restart handler from creating a new server
      this.shouldAutoRestart = false;

      // Close all connected sockets first
      Object.values(this.sockets).forEach((socket) => {
        if (socket) {
          try {
            this.closeSocket(socket);
          } catch {
            // ignore
          }
        }
      });

      // Clear sockets registry
      Object.keys(this.sockets).forEach((key) => {
        delete this.sockets[key];
      });

      // Stop IP ban garbage collector
      if (this.ip2banGC) {
        clearInterval(this.ip2banGC);
      }

      // Unsubscribe from store updates
      if (this.unsubscribe) {
        try {
          this.unsubscribe();
        } catch {
          // ignore
        }
        this.unsubscribe = undefined;
      }

      // Finally close the server and resolve when closed
      if (this.server && typeof this.server.close === "function") {
        try {
          this.server.close(() => resolve());
        } catch {
          // fallback resolve
          resolve();
        }
      } else {
        resolve();
      }
    });
  }
}
