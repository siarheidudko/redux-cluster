/**
 * Redux-Cluster High Load Test (TypeScript)
 * (c) 2024 by Siarhei Dudko.
 *
 * High load test with multiple workers and frequent dispatches
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
  green: (text: string): string => `\x1b[32m${text}\x1b[0m`,
  red: (text: string): string => `\x1b[31m${text}\x1b[0m`,
  blue: (text: string): string => `\x1b[34m${text}\x1b[0m`,
  yellow: (text: string): string => `\x1b[33m${text}\x1b[0m`,
};

// State interface
interface LoadTestState {
  version: string;
  counter: number;
  timestamp: number;
}

interface TaskAction extends Action<"TASK"> {
  payload: { version: string; counter: number; timestamp: number };
}

// Reducer with performance tracking
function loadTestReducer(
  state: LoadTestState = { version: "", counter: 0, timestamp: 0 },
  action: Action
): LoadTestState {
  try {
    switch (action.type) {
      case "TASK":
        const taskAction = action as TaskAction;
        const newState = deepClone(state);
        newState.version = taskAction.payload.version;
        newState.counter = taskAction.payload.counter;
        newState.timestamp = taskAction.payload.timestamp;
        return newState;
      default:
        return state;
    }
  } catch (e) {
    return deepClone(state);
  }
}

// Create stores
const store1 = createStore(loadTestReducer);
const store2 = createStore(loadTestReducer);
const testTwoStores = true;

// Performance tracking
let dispatchCount = 0;
let lastDispatchTime = Date.now();
let performanceStats = {
  dispatches: 0,
  avgLatency: 0,
  maxLatency: 0,
  minLatency: Infinity,
};

// Setup clients for high load testing
if (cluster.isPrimary) {
  store1.createClient({
    path: "./test-socket.sock",
    login: "test1",
    password: "12345",
  });

  if (testTwoStores) {
    store2.createClient({
      host: "127.0.0.1",
      port: 8888,
      login: "test2",
      password: "123456",
    });
  }
}

// Subscribe to changes with performance tracking
store1.subscribe(() => {
  const name = cluster.isPrimary ? "m" : cluster.worker?.id?.toString() || "?";
  const state = store1.getState();
  const latency = Date.now() - state.timestamp;

  // Update performance stats
  performanceStats.dispatches++;
  performanceStats.maxLatency = Math.max(performanceStats.maxLatency, latency);
  performanceStats.minLatency = Math.min(performanceStats.minLatency, latency);
  performanceStats.avgLatency =
    (performanceStats.avgLatency * (performanceStats.dispatches - 1) +
      latency) /
    performanceStats.dispatches;

  console.log(
    colors.blue(
      `L1 | ${name} | ${JSON.stringify(state)} | Latency: ${latency}ms`
    )
  );
});

if (testTwoStores) {
  store2.subscribe(() => {
    const name = cluster.isPrimary
      ? "m"
      : cluster.worker?.id?.toString() || "?";
    const state = store2.getState();
    const latency = Date.now() - state.timestamp;

    console.log(
      colors.yellow(
        `L2 | ${name} | ${JSON.stringify(state)} | Latency: ${latency}ms`
      )
    );
  });
}

if (cluster.isPrimary) {
  // Fork many workers for load testing
  const workerCount = 5;
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Initial dispatch
  store1.dispatch({
    type: "TASK",
    payload: { version: "LoadMasterTest0", counter: 0, timestamp: Date.now() },
  } as TaskAction);

  if (testTwoStores) {
    store2.dispatch({
      type: "TASK",
      payload: {
        version: "LoadMasterTest2-0",
        counter: 0,
        timestamp: Date.now(),
      },
    } as TaskAction);
  }

  // High frequency dispatch for load testing
  let i = 0;
  const highLoadInterval = setInterval(() => {
    const timestamp = Date.now();
    store1.dispatch({
      type: "TASK",
      payload: { version: `LoadMasterTest${i}`, counter: i, timestamp },
    } as TaskAction);

    if (testTwoStores) {
      store2.dispatch({
        type: "TASK",
        payload: { version: `LoadMasterTest2-${i}`, counter: i, timestamp },
      } as TaskAction);
    }
    i++;
  }, 100); // Very high frequency - every 100ms

  // Performance reporting
  setInterval(() => {
    console.log(
      colors.green(
        `Performance Stats - Dispatches: ${performanceStats.dispatches}, ` +
          `Avg Latency: ${performanceStats.avgLatency.toFixed(2)}ms, ` +
          `Min: ${performanceStats.minLatency}ms, Max: ${performanceStats.maxLatency}ms`
      )
    );
  }, 5000);

  // Stop test after some time
  setTimeout(() => {
    clearInterval(highLoadInterval);
    console.log(colors.red("Load test completed!"));
    process.exit(0);
  }, 30000); // Run for 30 seconds
} else {
  // Worker process - each worker has different dispatch frequency
  let i = 0;
  const workerId = cluster.worker?.id || 1;
  const workerInterval = workerId * 50; // Different intervals per worker

  setInterval(() => {
    const timestamp = Date.now();
    store1.dispatch({
      type: "TASK",
      payload: {
        version: `LoadWorkerTest${workerId}-${i}`,
        counter: i,
        timestamp,
      },
    } as TaskAction);

    if (testTwoStores) {
      store2.dispatch({
        type: "TASK",
        payload: {
          version: `LoadWorkerTest2-${workerId}-${i}`,
          counter: i,
          timestamp,
        },
      } as TaskAction);
    }
    i++;
  }, workerInterval);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log(colors.red("Final Performance Stats:"), performanceStats);
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log(colors.red("Final Performance Stats:"), performanceStats);
  process.exit(0);
});
