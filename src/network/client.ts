import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import * as stream from "stream";

import {
  ClientSettings,
  ReduxClusterStore,
  ClusterMessage,
  MessageType,
} from "../types";
import { hasher } from "../utils/crypto";

export class ClusterClient {
  public login?: string;
  public password?: string;

  private client: net.Socket;
  private listenOptions: any;

  constructor(
    private store: ReduxClusterStore,
    private settings: ClientSettings = {}
  ) {
    this.setupCredentials();
    this.setupConnection();
    this.connectToServer();
  }

  private setupCredentials(): void {
    if (typeof this.settings.login === "string") {
      this.login = hasher(`REDUX_CLUSTER${this.settings.login}`);
    }
    if (typeof this.settings.password === "string") {
      this.password = hasher(`REDUX_CLUSTER${this.settings.password}`);
    }
  }

  private setupConnection(): void {
    this.listenOptions = this.getListenOptions();
    this.client = new net.Socket();
    this.setupEventHandlers();
    this.setupPipeline();
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

  private setupEventHandlers(): void {
    this.client.on("connect", () => {
      this.handleConnection();
    });

    this.client.on("close", () => {
      this.handleDisconnection();
    });

    this.client.on("error", (err) => {
      this.store.stderr(
        `ReduxCluster.createClient client error: ${err.message}`
      );
    });
  }

  private handleConnection(): void {
    this.store.connected = true;
    this.store.sendtoall({
      _msg: MessageType.CONN_STATUS,
      _hash: this.store.RCHash,
      _connected: true,
    });

    // Override write method for object mode + compression
    (this.client as any).writeNEW = this.client.write;
    (this.client as any).write = (data: any): boolean => {
      try {
        const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
        return (this.client as any).writeNEW(compressed);
      } catch (err: any) {
        this.store.stderr(
          `ReduxCluster.createClient write error: ${err.message}`
        );
        return false;
      }
    };

    // Override store dispatch to send to master
    if (typeof (this.store as any).dispatchNEW !== "function") {
      (this.store as any).dispatchNEW = this.store.dispatch;
    }

    (this.store as any).dispatch = (action: any) => {
      (this.client as any).write({
        _msg: MessageType.MSG_TO_MASTER,
        _hash: this.store.RCHash,
        _action: action,
      });
    };

    // Authenticate with server
    (this.client as any).write({
      _msg: MessageType.SOCKET_AUTH,
      _hash: this.store.RCHash,
      _login: this.login,
      _password: this.password,
    });
  }

  private handleDisconnection(): void {
    this.store.connected = false;
    this.store.sendtoall({
      _msg: MessageType.CONN_STATUS,
      _hash: this.store.RCHash,
      _connected: false,
    });

    // Reconnect after 250ms
    setTimeout(() => {
      new ClusterClient(this.store, this.settings);
    }, 250);
  }

  private setupPipeline(): void {
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

    // Simple JSON parser
    const parser = new stream.Transform({
      transform(
        chunk: any,
        encoding: string,
        callback: (error?: Error | null) => void
      ) {
        try {
          const data = JSON.parse(chunk.toString());
          this.push(data);
        } catch (err) {
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
        this.handleServerMessage(data);
        callback();
      },
      objectMode: true,
    });

    // Setup error handlers
    [gunzipper, mbstring, parser, eventHandler].forEach((streamObj) => {
      streamObj.on("error", (err) => {
        this.store.stderr(
          `ReduxCluster.createClient stream error: ${err.message}`
        );
      });
    });

    // Connect pipeline
    this.client.pipe(gunzipper).pipe(mbstring).pipe(parser).pipe(eventHandler);
  }

  private handleServerMessage(data: any): void {
    if (this.client.destroyed || data._hash !== this.store.RCHash) {
      return;
    }

    switch (data._msg) {
      case MessageType.MSG_TO_WORKER:
        if ((this.store as any).dispatchNEW) {
          (this.store as any).dispatchNEW(data._action);
        }
        break;

      case MessageType.SOCKET_AUTH_STATE:
        if (data._value === true) {
          // Authentication successful, request initial state
          (this.client as any).write({
            _msg: MessageType.START,
            _hash: this.store.RCHash,
          });
        } else {
          // Authentication failed
          const error = data._banned
            ? new Error("your ip is locked for 3 hours")
            : new Error("authorization failed");
          this.client.destroy(error);
        }
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }

  private connectToServer(): void {
    this.client.connect(this.listenOptions);
  }
}
