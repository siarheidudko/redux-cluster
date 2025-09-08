/**
 * Integration Tests for Redux-Cluster
 * TCP/Socket communication tests
 */

import test from "node:test";
import assert from "node:assert";
import { createStore } from "../src";
import { SerializationMode } from "../src/types";

// Test reducer
const counterReducer = (state = { count: 0 }, action: any) => {
  switch (action.type) {
    case "INCREMENT":
      return { count: state.count + 1 };
    case "DECREMENT":
      return { count: state.count - 1 };
    case "RESET":
      return { count: 0 };
    default:
      return state;
  }
};

test("TCP Server-Client synchronization", async (t) => {
  // This test should run in different processes via Docker
  const role = process.env.CLUSTER_ROLE;
  const testType = process.env.TEST_TYPE;

  if (testType !== "integration") {
    t.skip("Integration test skipped - not in integration environment");
    return;
  }

  if (role === "master") {
    // Master/Server process
    const serverStore = createStore(counterReducer, {
      mode: "action",
      role: ["master", "server"],
      server: {
        port: 3001,
        host: "0.0.0.0",
      },
      serializationMode: SerializationMode.JSON,
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Dispatch some actions
    serverStore.dispatch({ type: "INCREMENT" });
    serverStore.dispatch({ type: "INCREMENT" });

    console.log("Master state:", serverStore.getState());
    assert.strictEqual(
      serverStore.getState().count,
      2,
      "Master should have count = 2"
    );

    // Keep server running for workers to connect
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } else if (role === "worker") {
    const workerId = process.env.WORKER_ID || "1";

    // Worker/Client process
    const clientStore = createStore(counterReducer, {
      mode: "action",
      role: ["worker", "client"],
      client: {
        port: 3001,
        host: "test-master",
      },
      serializationMode: SerializationMode.JSON,
    });

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(`Worker ${workerId} state:`, clientStore.getState());

    // Dispatch action from worker
    clientStore.dispatch({ type: "INCREMENT" });

    // Wait for synchronization
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`Worker ${workerId} final state:`, clientStore.getState());
  }
});

test("ProtoObject serialization mode", async (t) => {
  const role = process.env.CLUSTER_ROLE;
  const testType = process.env.TEST_TYPE;

  if (testType !== "integration") {
    t.skip("Integration test skipped - not in integration environment");
    return;
  }

  // Complex state with nested objects
  interface ComplexState {
    user: { id: number; name: string };
    items: any[];
    metadata: Date;
  }

  const complexReducer = (
    state: ComplexState = {
      user: { id: 1, name: "Test" },
      items: [],
      metadata: new Date(),
    },
    action: any
  ): ComplexState => {
    switch (action.type) {
      case "ADD_USER":
        return {
          ...state,
          user: action.payload,
        };
      case "ADD_ITEM":
        return {
          ...state,
          items: [...state.items, action.payload],
        };
      default:
        return state;
    }
  };

  if (role === "master") {
    const serverStore = createStore(complexReducer, {
      mode: "snapshot",
      role: ["master", "server"],
      server: {
        port: 3002,
        host: "0.0.0.0",
      },
      serializationMode: SerializationMode.PROTOOBJECT,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    serverStore.dispatch({
      type: "ADD_USER",
      payload: { id: 2, name: "Updated User" },
    });

    console.log("Master ProtoObject state:", serverStore.getState());

    await new Promise((resolve) => setTimeout(resolve, 3000));
  } else if (role === "worker") {
    const clientStore = createStore(complexReducer, {
      mode: "snapshot",
      role: ["worker", "client"],
      client: {
        port: 3002,
        host: "test-master",
      },
      serializationMode: SerializationMode.PROTOOBJECT,
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("Worker ProtoObject state:", clientStore.getState());
  }
});

test("High-load stress test", async (_t) => {
  const testType = process.env.TEST_TYPE;

  if (testType !== "highload") {
    _t.skip("High-load test skipped - not in highload environment");
    return;
  }

  const store = createStore(counterReducer, {
    mode: "action",
    role: ["master"],
    serializationMode: SerializationMode.JSON,
  });

  const startTime = Date.now();
  const iterations = 10000;

  // Stress test with many dispatches
  for (let i = 0; i < iterations; i++) {
    store.dispatch({ type: "INCREMENT" });
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(
    `High-load test completed: ${iterations} actions in ${duration}ms`
  );
  console.log(`Final state:`, store.getState());

  assert.strictEqual(
    store.getState().count,
    iterations,
    `Count should be ${iterations}`
  );
  assert(duration < 5000, "Should complete within 5 seconds");
});

// Backup and restore functionality test
test("Backup and restore functionality", async (_t) => {
  const store = createStore(counterReducer, {
    backup: {
      path: "/tmp/redux-cluster-test-backup.json",
      timeout: 1000,
    },
  });

  // Create some state
  store.dispatch({ type: "INCREMENT" });
  store.dispatch({ type: "INCREMENT" });
  store.dispatch({ type: "INCREMENT" });

  const stateBeforeBackup = store.getState();

  // Wait for backup to be created
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Reset state
  store.dispatch({ type: "RESET" });
  assert.strictEqual(store.getState().count, 0, "State should be reset");

  // TODO: Implement restore functionality test
  console.log("Backup test completed, state before backup:", stateBeforeBackup);
});
