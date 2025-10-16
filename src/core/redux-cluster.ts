import { createStore, Store, Reducer, Action } from "redux";
import cluster from "cluster";
import { readFileSync } from "fs";
import { join } from "path";
import {
  hasher,
  universalClone,
  universalSerialize,
  universalDeserialize,
  createClassRegistry,
} from "../utils/crypto.js";
import {
  ReduxClusterStore,
  SyncMode,
  Role,
  ClusterMessage,
  MessageType,
  ServerSettings,
  ClientSettings,
  BackupSettings,
  ErrorHandler,
  ReduxClusterConfig,
  SerializationMode,
} from "../types/index.js";
import { ClusterServer } from "../network/server.js";
import { ClusterClient } from "../network/client.js";
import { BackupManager } from "./backup.js";

// Global reducers registry to prevent name conflicts
const reducers: Record<string, string> = {};

export class ReduxCluster<S = any, A extends Action = Action>
  implements ReduxClusterStore<S, A>
{
  // Redux Store properties
  public readonly dispatch: Store<S, A>["dispatch"];
  public readonly getState: Store<S, A>["getState"];
  public readonly subscribe: Store<S, A>["subscribe"];
  public readonly replaceReducer: Store<S, A>["replaceReducer"];
  public readonly [Symbol.observable]: Store<S, A>[typeof Symbol.observable];

  // ReduxCluster specific properties
  public readonly RCHash: string;
  public readonly version: string;
  public readonly homepage: string;
  public readonly role: Role[] = [];
  public connected = false;
  public mode: SyncMode = "action";
  public resync = 1000;
  public stderr: ErrorHandler = console.error;
  public readonly config: ReduxClusterConfig;

  private readonly altReducer: Reducer<S, A>;
  private readonly defaultState: S;
  private readonly store: Store<S, A>;
  private readonly allsock: Record<string, any> = {};
  private counter?: number;
  private dispatchNEW?: Store<S, A>["dispatch"];
  private unsubscribe?: () => void;
  private classRegistry = createClassRegistry();

  constructor(reducer: Reducer<S, A>, config: ReduxClusterConfig = {}) {
    this.altReducer = reducer;
    this.RCHash = hasher(reducer.name) || "";

    // Set configuration with defaults
    this.config = {
      serializationMode: SerializationMode.JSON,
      debug: false,
      ...config,
    };

    // Apply configuration to instance properties
    if (config.mode) this.mode = config.mode;
    if (config.role) this.role.push(...config.role);
    if (config.stderr) this.stderr = config.stderr;
    if (config.resync) this.resync = config.resync;

    // Initialize class registry only if ProtoObject mode is enabled
    if (this.config.serializationMode === SerializationMode.PROTOOBJECT) {
      this.classRegistry = createClassRegistry();
    }

    // Load package info
    try {
      let packagePath: string;
      try {
        // Try CommonJS approach first (__dirname available)
        packagePath = join(__dirname, "../../package.json");
      } catch {
        // Fallback - use relative path from process.cwd()
        packagePath = join(process.cwd(), "package.json");
      }

      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      this.version = packageJson.version;
      this.homepage = packageJson.homepage;
    } catch {
      this.version = "2.0.0";
      this.homepage = "https://github.com/siarheidudko/redux-cluster";
    }

    // Validate reducer uniqueness (only if different hash)
    if (
      typeof reducers[reducer.name] !== "undefined" &&
      reducers[reducer.name] !== this.RCHash
    ) {
      throw new Error("Please don't use a reducer with the same name!");
    }
    reducers[reducer.name] = this.RCHash;

    // Get default state
    try {
      const defaultState = this.altReducer(undefined as any, {} as A);
      if (typeof defaultState === "object" && defaultState !== null) {
        this.defaultState = defaultState;
      } else {
        throw new Error("The returned value is not an object.");
      }
    } catch {
      this.defaultState = {} as S;
    }

    // Create Redux store with custom reducer
    this.store = createStore(this.createNewReducer());

    // Bind Redux methods
    this.dispatch = this.store.dispatch;
    this.getState = this.store.getState;
    this.subscribe = this.store.subscribe;
    this.replaceReducer = this.store.replaceReducer;
    this[Symbol.observable] = this.store[Symbol.observable];

    this.initializeClusterRole();
  }

  // Internal method for sync actions
  private internalSync(payload: S): void {
    this.store.dispatch({
      type: MessageType.SYNC,
      payload,
      _internal: true,
    } as any);
  }

  // Expose internal sync for backup purposes
  public _internalSync(payload: S): void {
    this.internalSync(payload);
  }

  private createNewReducer(): Reducer<S, A> {
    return (state = this.defaultState, action): S => {
      // Handle sync action (internal use only)
      if (action.type === MessageType.SYNC) {
        // Check if this is an internal sync call
        const syncAction = action as any;
        if (syncAction._internal) {
          return universalClone(
            syncAction.payload,
            this.config.serializationMode!,
            this.classRegistry
          );
        } else {
          throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
        }
      }

      // Handle sync mode
      if (this.mode === "action") {
        this.updateCounter();
        this.sendActionsToNodes(action);
      }

      return this.altReducer(state, action);
    };
  }

  private updateCounter(): void {
    if (typeof this.counter === "undefined" || this.counter === this.resync) {
      this.counter = 1;
    } else {
      this.counter++;
    }

    // Periodic full sync
    if (this.counter === this.resync) {
      if (this.role.includes("master")) {
        setTimeout(() => this.sendtoall(), 100);
      }
      if (this.role.includes("server")) {
        setTimeout(() => this.sendtoallsock(), 100);
      }
    }
  }

  private sendActionsToNodes(action: A): void {
    if (this.role.includes("master")) {
      setTimeout(
        () =>
          this.sendtoall({
            _msg: MessageType.MSG_TO_WORKER,
            _hash: this.RCHash,
            _action: action,
          }),
        1
      );
    }

    if (this.role.includes("server")) {
      setTimeout(
        () =>
          this.sendtoallsock({
            _msg: MessageType.MSG_TO_WORKER,
            _hash: this.RCHash,
            _action: action,
          }),
        1
      );
    }
  }

  private initializeClusterRole(): void {
    // Assign "master" role only to primary process in cluster
    if (cluster.isPrimary) {
      this.initializeMaster();
    } else {
      // Assign "worker" role to non-master processes
      this.initializeWorker();
    }
  }

  private initializeMaster(): void {
    if (!this.role.includes("master")) {
      this.role.push("master");
    }

    // Subscribe to changes in snapshot mode
    this.unsubscribe = this.subscribe(() => {
      if (this.mode === "snapshot") {
        this.sendtoall();
      }
    });

    // Listen for messages from workers
    cluster.on("message", (worker: any, message: any, _handle: any) => {
      if (arguments.length === 2) {
        _handle = message;
        message = worker;
        worker = undefined;
      }

      this.handleMasterMessage(message, worker);
    });

    this.connected = true;
  }

  private initializeWorker(): void {
    if (!this.role.includes("worker")) {
      this.role.push("worker");
    }

    // Override dispatch to send to master
    this.dispatchNEW = this.dispatch;
    (this as any).dispatch = (action: A) => {
      if (process.send) {
        process.send({
          _msg: MessageType.MSG_TO_MASTER,
          _hash: this.RCHash,
          _action: action,
        });
      }
    };

    // Listen for messages from master
    process.on("message", (data) => {
      this.handleWorkerMessage(data);
    });

    this.connected = true;

    // Request initial state
    if (process.send) {
      process.send({
        _msg: MessageType.START,
        _hash: this.RCHash,
      });
    }
  }

  private handleMasterMessage(message: any, worker?: any): void {
    if (message._hash === this.RCHash) {
      switch (message._msg) {
        case MessageType.MSG_TO_MASTER:
          if (
            message._action.type === MessageType.SYNC &&
            !message._action._internal
          ) {
            throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
          }
          // Deserialize action if it contains ProtoObject
          let action = message._action;
          if (message._serialized) {
            try {
              action = universalDeserialize(
                message._serialized,
                this.config.serializationMode!,
                this.classRegistry
              )._action;
            } catch {
              // Fallback to regular action
              action = message._action;
            }
          }
          this.store.dispatch(action);
          break;

        case MessageType.START:
          const responseMsg = {
            _msg: MessageType.MSG_TO_WORKER,
            _hash: this.RCHash,
            _action: {
              type: MessageType.SYNC,
              payload: this.getState(),
              _internal: true,
            },
          };
          const serializedResponse = {
            ...responseMsg,
            _serialized: universalSerialize(
              responseMsg,
              this.config.serializationMode!,
              this.classRegistry
            ),
          };

          if (worker && cluster.workers && cluster.workers[worker.id]) {
            cluster.workers[worker.id]!.send(serializedResponse);
          } else {
            this.sendtoall();
          }
          break;

        default:
          // Ignore unknown message types
          break;
      }
    }
  }

  private handleWorkerMessage(data: any): void {
    if (data._hash === this.RCHash && this.role.includes("worker")) {
      // Deserialize ProtoObject if needed
      let processedData = data;
      if (data._serialized) {
        try {
          processedData = JSON.parse(data._serialized);
          processedData = universalDeserialize(
            data._serialized,
            this.config.serializationMode!,
            this.classRegistry
          );
        } catch {
          // Fallback to regular data if deserialization fails
          processedData = data;
        }
      }

      switch (processedData._msg) {
        case MessageType.MSG_TO_WORKER:
          if (this.dispatchNEW) {
            this.dispatchNEW(processedData._action);
          }
          break;

        case MessageType.CONN_STATUS:
          this.connected = processedData._connected;
          break;

        default:
          // Ignore unknown message types
          break;
      }
    }
  }

  public sendtoall(message?: ClusterMessage): void {
    if (cluster.isPrimary && cluster.workers) {
      const msg = message || {
        _msg: MessageType.MSG_TO_WORKER,
        _hash: this.RCHash,
        _action: {
          type: MessageType.SYNC,
          payload: this.getState(),
          _internal: true,
        },
      };

      // Serialize ProtoObject instances for IPC
      const serializedMsg = {
        ...msg,
        _serialized: universalSerialize(
          msg,
          this.config.serializationMode!,
          this.classRegistry
        ),
      };

      for (const id in cluster.workers) {
        if (cluster.workers[id]) {
          cluster.workers[id]!.send(serializedMsg);
        }
      }
    }
  }

  public sendtoallsock(message?: ClusterMessage): void {
    for (const id in this.allsock) {
      if (
        typeof this.allsock[id] === "object" &&
        typeof this.allsock[id].sendtoall === "function"
      ) {
        setTimeout(() => this.allsock[id].sendtoall(message), 1);
      }
    }
  }

  public createServer(settings?: ServerSettings): ClusterServer {
    if (!cluster.isPrimary && settings?.path && process.platform === "win32") {
      throw new Error(
        "Named channel is not supported in the child process, please use TCP-server"
      );
    }

    if (!this.role.includes("server")) {
      this.role.push("server");
    }

    this.connected = false;
    return new ClusterServer(this, settings);
  }

  public createClient(settings?: ClientSettings): ClusterClient {
    if (this.role.includes("client")) {
      throw new Error(
        "One storage cannot be connected to two servers at the same time."
      );
    }

    if (!this.role.includes("client")) {
      this.role.push("client");
    }

    this.connected = false;
    return new ClusterClient(this, settings);
  }

  public backup(settings: BackupSettings): Promise<boolean> {
    return new BackupManager(this, settings).initialize();
  }

  // Register custom ProtoObject classes for proper serialization
  public registerClass(name: string, classConstructor: any): void {
    if (this.config.serializationMode === SerializationMode.PROTOOBJECT) {
      this.classRegistry.set(name, classConstructor);
    } else {
      console.warn("registerClass() is only available in ProtoObject mode");
    }
  }

  // Get registered classes (useful for debugging)
  public getRegisteredClasses(): string[] {
    if (this.config.serializationMode === SerializationMode.PROTOOBJECT) {
      return Array.from(this.classRegistry.keys());
    }
    return [];
  }
}
