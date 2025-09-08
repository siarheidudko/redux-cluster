/**
 * Redux-Cluster Visual Test (TypeScript)
 * (c) 2024 by Siarhei Dudko.
 *
 * Visual test for cluster IPC channel synchronization
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

// Console colors without external dependencies
const colors = {
  gray: (text: string): string => `\x1b[90m${text}\x1b[0m`,
  yellow: (text: string): string => `\x1b[33m${text}\x1b[0m`,
};

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

// Subscribe to changes
store1.subscribe(() => {
  const name = cluster.isPrimary ? "m" : cluster.worker?.id?.toString() || "?";
  console.log(
    colors.gray(`${name} | Store1 | ${JSON.stringify(store1.getState())}`)
  );
});

if (testTwoStores) {
  store2.subscribe(() => {
    const name = cluster.isPrimary
      ? "m"
      : cluster.worker?.id?.toString() || "?";
    console.log(
      colors.yellow(`${name} | Store2 | ${JSON.stringify(store2.getState())}`)
    );
  });
}

if (cluster.isPrimary) {
  // Fork multiple workers
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      cluster.fork();
    }, i * 2000);
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

  // Periodic dispatch
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
  }, 5000);
} else {
  // Worker process
  let i = 0;
  setInterval(() => {
    const workerId = cluster.worker?.id || 0;
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
  }, 5000);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});
