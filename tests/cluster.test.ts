/**
 * Redux-Cluster Integration Test
 * (c) 2018-2024 by Siarhei Dudko.
 *
 * Cluster IPC channel test
 * LICENSE MIT
 */

import test from "node:test";
import assert from "node:assert";
import cluster from "cluster";
import { createStore } from "../src";

// Simple reducer for testing
const testReducer = (state = { counter: 0 }, action: any) => {
  switch (action.type) {
    case "INC":
      return { counter: state.counter + 1 };
    case "DEC":
      return { counter: state.counter - 1 };
    default:
      return state;
  }
};

test("Cluster IPC synchronization", async (_t) => {
  if (cluster.isPrimary) {
    // Primary process
    const store = createStore(testReducer, {
      mode: "action",
      syncMode: "ipc",
      role: ["master", "server"],
    });

    // Fork worker process
    const worker = cluster.fork();

    // Wait for worker to be ready
    await new Promise((resolve) => {
      worker.on("message", (msg) => {
        if (msg === "worker-ready") {
          resolve(void 0);
        }
      });
    });

    // Dispatch action in primary
    store.dispatch({ type: "INC" });

    // Wait a bit for synchronization
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(
      store.getState().counter,
      1,
      "Primary state should be updated"
    );

    // Send test completion message
    worker.send("test-complete");

    // Wait for worker to finish
    await new Promise((resolve) => {
      worker.on("exit", resolve);
    });
  } else {
    // Worker process
    const store = createStore(testReducer, {
      mode: "action",
      syncMode: "ipc",
      role: ["worker", "client"],
    }); // Notify primary that worker is ready
    process.send!("worker-ready");

    // Listen for test completion
    process.on("message", (msg) => {
      if (msg === "test-complete") {
        // Check if state was synchronized
        const state = store.getState();
        if (state.counter === 1) {
          console.log("✅ Worker: State synchronized correctly");
          process.exit(0);
        } else {
          console.error(
            "❌ Worker: State not synchronized, counter:",
            state.counter
          );
          process.exit(1);
        }
      }
    });
  }
});

test("Master-Slave state synchronization", async (_t) => {
  interface TestState {
    items: string[];
    total: number;
  }

  const initialState: TestState = { items: [], total: 0 };

  const reducer = (state = initialState, action: any): TestState => {
    switch (action.type) {
      case "ADD_ITEM":
        return {
          items: [...state.items, action.payload],
          total: state.total + 1,
        };
      case "CLEAR_ITEMS":
        return initialState;
      default:
        return state;
    }
  };

  if (cluster.isPrimary) {
    const masterStore = createStore(reducer, {
      mode: "snapshot",
      syncMode: "ipc",
      role: ["master"],
    });

    const worker = cluster.fork();

    await new Promise((resolve) => {
      worker.on("message", (msg) => {
        if (msg === "worker-ready") {
          resolve(void 0);
        }
      });
    });

    // Add items in master
    masterStore.dispatch({ type: "ADD_ITEM", payload: "item1" });
    masterStore.dispatch({ type: "ADD_ITEM", payload: "item2" });

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(
      masterStore.getState().total,
      2,
      "Master should have 2 items"
    );

    worker.send("check-state");

    await new Promise((resolve) => {
      worker.on("exit", resolve);
    });
  } else {
    const slaveStore = createStore(reducer, {
      mode: "snapshot",
      syncMode: "ipc",
      role: ["worker"],
    });

    process.send!("worker-ready");

    process.on("message", (msg) => {
      if (msg === "check-state") {
        const state = slaveStore.getState();
        if (state.total === 2 && state.items.length === 2) {
          console.log("✅ Slave: State synchronized correctly");
          process.exit(0);
        } else {
          console.error("❌ Slave: State not synchronized", state);
          process.exit(1);
        }
      }
    });
  }
});
