/**
 * Redux-Cluster Integration Test (TypeScript)
 * (c) 2024 by Siarhei Dudko.
 *
 * Standard test for cluster IPC channel synchronization
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

function isEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Console colors without external dependencies
const colors = {
  green: (text: string): string => `\x1b[32m${text}\x1b[0m`,
  red: (text: string): string => `\x1b[31m${text}\x1b[0m`,
  gray: (text: string): string => `\x1b[90m${text}\x1b[0m`,
  yellow: (text: string): string => `\x1b[33m${text}\x1b[0m`,
};

// State interfaces
interface TaskState {
  versions: string[];
}

interface UpdateState {
  versions: string[];
}

interface TaskAction extends Action<"TASK"> {
  payload: { version: string };
}

interface UpdateAction extends Action<"UPDATE"> {
  payload: { versions: string[] };
}

// Reducers
function taskReducer(
  state: TaskState = { versions: [] },
  action: Action
): TaskState {
  try {
    switch (action.type) {
      case "TASK":
        const taskAction = action as TaskAction;
        const newState = deepClone(state);
        if (newState.versions.length > 500) {
          newState.versions.splice(0, 100);
        }
        newState.versions.push(taskAction.payload.version);
        return newState;
      default:
        return state;
    }
  } catch (e) {
    return deepClone(state);
  }
}

function updateReducer(
  state: UpdateState = { versions: [] },
  action: Action
): UpdateState {
  try {
    switch (action.type) {
      case "UPDATE":
        const updateAction = action as UpdateAction;
        const newState = deepClone(state);
        newState.versions = updateAction.payload.versions;
        return newState;
      default:
        return state;
    }
  } catch (e) {
    return deepClone(state);
  }
}

// Test setup
const testStore = createStore(taskReducer);
testStore.mode = "action";
const syncStore = createStore(updateReducer);

if (cluster.isPrimary) {
  // Fork worker after delay
  setTimeout(() => {
    cluster.fork();
  }, 1000);

  testStore.dispatch({
    type: "TASK",
    payload: { version: "MasterTest0" },
  } as TaskAction);

  let i = 0;
  setInterval(() => {
    testStore.dispatch({
      type: "TASK",
      payload: { version: `MasterTest${i}` },
    } as TaskAction);
    i++;
  }, 55);

  // Test validation
  let successCount = 0;
  let failureCount = 0;

  setInterval(() => {
    if (isEqual(testStore.getState().versions, syncStore.getState().versions)) {
      successCount++;
      console.log(
        colors.green(
          `✓ ok-${successCount} | ${Math.floor(
            (successCount * 100) / (successCount + failureCount)
          )}%`
        )
      );
    } else {
      failureCount++;
      console.log(
        colors.red(
          `✗ bad-${failureCount} | ${Math.floor(
            (failureCount * 100) / (successCount + failureCount)
          )}%`
        )
      );
    }
  }, 1000);
} else {
  testStore.dispatch({
    type: "TASK",
    payload: { version: "WorkerTest0" },
  } as TaskAction);

  let i = 0;
  setInterval(() => {
    testStore.dispatch({
      type: "TASK",
      payload: { version: `WorkerTest${i}` },
    } as TaskAction);
    i++;
  }, 99);

  // Sync stores
  testStore.subscribe(() => {
    syncStore.dispatch({
      type: "UPDATE",
      payload: { versions: testStore.getState().versions },
    } as UpdateAction);
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});
