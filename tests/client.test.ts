/**
 * Redux-Cluster Client Test (TypeScript)
 * (c) 2024 by Siarhei Dudko.
 *
 * Test for Socket IPC and TCP (remote) client functionality
 * LICENSE MIT
 */

import cluster from "cluster";
import { createStore } from "../src/index";
import { Action } from "redux";

// Test utilities
function deepClone<T>(obj: T): T {
  if (typeof (globalThis as any).structuredClone === "function") {
    return (globalThis as any).structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

// State interface
interface TestState {
  version: string;
}

interface TaskAction extends Action<"TASK"> {
  payload: { version: string };
}

// Reducer
function versionReducer(
  state: TestState = { version: "" },
  action: Action
): TestState {
  try {
    switch (action.type) {
      case "TASK":
        const taskAction = action as TaskAction;
        const newState = deepClone(state);
        newState.version = taskAction.payload.version;
        return newState;
      default:
        return state;
    }
  } catch (e) {
    return deepClone(state);
  }
}

// Create stores
const store1 = createStore(versionReducer);
const store2 = createStore(versionReducer);
const testTwoStores = true;

// Setup clients
if (cluster.isPrimary) {
  // Master connects to TCP server
  store1.createClient({
    host: "localhost",
    port: 8888,
    login: "test2",
    password: "123456",
  });
} else {
  // Worker connects to Unix socket server
  if (testTwoStores) {
    store2.createClient({
      path: "./test-socket.sock",
      login: "test1",
      password: "12345",
    });
  }
}

// Subscribe to changes
store1.subscribe(() => {
  const name = cluster.isPrimary ? "m" : cluster.worker?.id?.toString() || "?";
  console.log(`C1 | ${name} | ${JSON.stringify(store1.getState())}`);
});

if (testTwoStores) {
  store2.subscribe(() => {
    const name = cluster.isPrimary
      ? "m"
      : cluster.worker?.id?.toString() || "?";
    console.log(`C2 | ${name} | ${JSON.stringify(store2.getState())}`);
  });
}

if (cluster.isPrimary) {
  // Fork workers with delay
  for (let i = 0; i < 2; i++) {
    setTimeout(() => {
      cluster.fork();
    }, i * 5000);
  }

  // Initial dispatch
  store1.dispatch({
    type: "TASK",
    payload: { version: "OneRemoteMasterTest0" },
  } as TaskAction);
  if (testTwoStores) {
    store2.dispatch({
      type: "TASK",
      payload: { version: "TwoRemoteMasterTest0" },
    } as TaskAction);
  }

  // Periodic dispatch
  let i = 0;
  setInterval(() => {
    store1.dispatch({
      type: "TASK",
      payload: { version: `OneRemoteMasterTest${i}` },
    } as TaskAction);
    if (testTwoStores) {
      store2.dispatch({
        type: "TASK",
        payload: { version: `TwoRemoteMasterTest${i}` },
      } as TaskAction);
    }
    i++;
  }, 11000);
} else {
  // Worker process with different intervals per worker
  let i = 0;
  const workerId = cluster.worker?.id || 1;
  const interval = 22000 + workerId * 1500;

  setInterval(() => {
    store1.dispatch({
      type: "TASK",
      payload: { version: `OneRemoteWorkerTest${workerId}-${i}` },
    } as TaskAction);
    if (testTwoStores) {
      store2.dispatch({
        type: "TASK",
        payload: { version: `TwoRemoteWorkerTest${workerId}-${i}` },
      } as TaskAction);
    }
    i++;
  }, interval);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});
