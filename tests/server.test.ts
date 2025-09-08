/**
 * Redux-Cluster Server Test (TypeScript)
 * (c) 2024 by Siarhei Dudko.
 *
 * Test for Socket IPC and TCP (remote) server functionality
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

// Setup servers
if (!cluster.isPrimary) {
  // Worker creates TCP server
  store1.createServer({
    host: "0.0.0.0",
    port: 8888,
    logins: { test2: "123456" },
  });
} else {
  // Master creates Unix socket server
  if (testTwoStores) {
    store2.createServer({
      path: "./test-socket.sock",
      logins: { test1: "12345" },
    });
  }
}

// Subscribe to changes
store1.subscribe(() => {
  const name = cluster.isPrimary ? "m" : cluster.worker?.id?.toString() || "?";
  console.log(`S1 | ${name} | ${JSON.stringify(store1.getState())}`);
});

if (testTwoStores) {
  store2.subscribe(() => {
    const name = cluster.isPrimary
      ? "m"
      : cluster.worker?.id?.toString() || "?";
    console.log(`S2 | ${name} | ${JSON.stringify(store2.getState())}`);
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
    payload: { version: "OneMasterTest0" },
  } as TaskAction);
  if (testTwoStores) {
    store2.dispatch({
      type: "TASK",
      payload: { version: "TwoMasterTest0" },
    } as TaskAction);
  }

  // Periodic dispatch - slower for server test
  let i = 0;
  setInterval(() => {
    store1.dispatch({
      type: "TASK",
      payload: { version: `OneMasterTest${i}` },
    } as TaskAction);
    if (testTwoStores) {
      store2.dispatch({
        type: "TASK",
        payload: { version: `TwoMasterTest${i}` },
      } as TaskAction);
    }
    i++;
  }, 19000);
} else {
  // Worker process with different intervals per worker
  let i = 0;
  const workerId = cluster.worker?.id || 1;
  const interval = 31000 + workerId * 3600;

  setInterval(() => {
    store1.dispatch({
      type: "TASK",
      payload: { version: `OneWorkerTest${workerId}-${i}` },
    } as TaskAction);
    if (testTwoStores) {
      store2.dispatch({
        type: "TASK",
        payload: { version: `TwoWorkerTest${workerId}-${i}` },
      } as TaskAction);
    }
    i++;
  }, interval);
}

// Cleanup socket file on exit
if (cluster.isPrimary && testTwoStores) {
  process.on("exit", () => {
    try {
      require("fs").unlinkSync("./test-socket.sock");
    } catch (e) {
      // Ignore errors
    }
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});
