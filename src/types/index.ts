import { Store, Reducer, Action } from "redux";

// Serialization modes
export enum SerializationMode {
  JSON = "json",
  PROTOOBJECT = "protoobject",
}

// Redux-Cluster configuration
export interface ReduxClusterConfig {
  // Serialization mode for IPC communication
  serializationMode?: SerializationMode;
  // Whether to enable debug logging
  debug?: boolean;
}

// Type for ProtoObject-based state (when protoobject is available)
export type ProtoObjectState = any;

// Message types for IPC communication
export enum MessageType {
  CONN_STATUS = "REDUX_CLUSTER_CONNSTATUS",
  MSG_TO_WORKER = "REDUX_CLUSTER_MSGTOWORKER",
  MSG_TO_MASTER = "REDUX_CLUSTER_MSGTOMASTER",
  SOCKET_AUTH = "REDUX_CLUSTER_SOCKET_AUTH",
  SOCKET_AUTH_STATE = "REDUX_CLUSTER_SOCKET_AUTHSTATE",
  START = "REDUX_CLUSTER_START",
  SYNC = "REDUX_CLUSTER_SYNC",
}

// Base message interface
export interface BaseMessage {
  _msg: MessageType;
  _hash: string;
}

// Connection status message
export interface ConnectionStatusMessage extends BaseMessage {
  _msg: MessageType.CONN_STATUS;
  _connected: boolean;
}

// Action message to worker
export interface ActionToWorkerMessage extends BaseMessage {
  _msg: MessageType.MSG_TO_WORKER;
  _action: Action;
}

// Action message to master
export interface ActionToMasterMessage extends BaseMessage {
  _msg: MessageType.MSG_TO_MASTER;
  _action: Action;
}

// Socket authentication message
export interface SocketAuthMessage extends BaseMessage {
  _msg: MessageType.SOCKET_AUTH;
  _login: string;
  _password: string;
}

// Socket authentication state message
export interface SocketAuthStateMessage extends BaseMessage {
  _msg: MessageType.SOCKET_AUTH_STATE;
  _value: boolean;
  _banned?: boolean;
}

// Start synchronization message
export interface StartMessage extends BaseMessage {
  _msg: MessageType.START;
}

// Union of all message types
export type ClusterMessage =
  | ConnectionStatusMessage
  | ActionToWorkerMessage
  | ActionToMasterMessage
  | SocketAuthMessage
  | SocketAuthStateMessage
  | StartMessage;

// Sync mode types
export type SyncMode = "action" | "snapshot";

// Role types
export type Role = "master" | "worker" | "server" | "client";

// Server settings
export interface ServerSettings {
  host?: string;
  port?: number;
  path?: string;
  logins?: Record<string, string>;
}

// Client settings
export interface ClientSettings {
  host?: string;
  port?: number;
  path?: string;
  login?: string;
  password?: string;
}

// Backup settings
export interface BackupSettings {
  path: string;
  key?: string;
  timeout?: number;
  count?: number;
}

// Main Redux-Cluster store interface
export interface ReduxClusterStore<S = any, A extends Action = Action>
  extends Store<S, A> {
  // Redux-Cluster specific properties
  readonly RCHash: string;
  readonly version: string;
  readonly homepage: string;
  readonly role: Role[];
  connected: boolean;
  mode: SyncMode;
  resync: number;
  stderr: (message: string) => void;

  // Configuration
  readonly config: ReduxClusterConfig;

  // Network methods
  createServer(settings?: ServerSettings): ClusterServer;
  createClient(settings?: ClientSettings): ClusterClient;

  // Backup methods
  backup(settings: BackupSettings): Promise<boolean>;

  // Internal methods
  sendtoall(message?: ClusterMessage): void;
  sendtoallsock(message?: ClusterMessage): void;

  // ProtoObject methods (only available when protoobject mode is enabled)
  registerClass?(name: string, classConstructor: any): void;
  getRegisteredClasses?(): string[];
}

// Server interface
export interface ClusterServer {
  readonly uid: string;
  readonly sockets: Record<string, any>;
  readonly database: Record<string, string>;
  readonly ip2ban: Record<string, { time: number; count: number }>;

  sendtoall(message?: ClusterMessage): void;
  ip2banGCStop(): void;
}

// Client interface
export interface ClusterClient {
  login?: string;
  password?: string;
}

// Socket with additional properties
export interface ClusterSocket {
  uid: string;
  writeNEW: (data: any) => boolean;
  write(data: any): boolean;
  on(event: string, listener: (...args: any[]) => void): any;
  pipe(...args: any[]): any;
  end(): void;
  remoteAddress?: string;
}

// Utility function types
export type HasherFunction = (
  data: string,
  algorithm?: string
) => string | undefined;
export type EncrypterFunction = (data: string, pass: string) => string;
export type DecrypterFunction = (data: string, pass: string) => string;

// Error handler type
export type ErrorHandler = (message: string) => void;
