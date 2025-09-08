/**
 * Redux-Cluster Error Test (TypeScript)
 * (c) 2024 by Siarhei Dudko.
 *
 * Test error handling and edge cases
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
  red: (text: string): string => `\x1b[31m${text}\x1b[0m`,
  green: (text: string): string => `\x1b[32m${text}\x1b[0m`,
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
function errorTestReducer(
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

// Create first store
const store1 = createStore(errorTestReducer);

// Test 1: Try to create duplicate store (should handle gracefully)
try {
  if (cluster.isPrimary) {
    console.log(colors.yellow("Testing duplicate store creation..."));
    const store2 = createStore(errorTestReducer);
    console.log(colors.green("✓ Duplicate store creation handled gracefully"));
  }
} catch (err) {
  if (err instanceof Error) {
    console.log(colors.red(`✗ Error creating duplicate store: ${err.message}`));
  }
}

// Test 2: Try to dispatch reserved action type (should throw error)
try {
  console.log(colors.yellow("Testing reserved action type dispatch..."));
  store1.dispatch({ type: "REDUX_CLUSTER_SYNC", payload: { test: 1 } } as any);
  console.log(
    colors.red("✗ Reserved action type dispatch should have thrown error")
  );
} catch (err) {
  if (err instanceof Error) {
    console.log(
      colors.green(`✓ Reserved action type properly rejected: ${err.message}`)
    );
  }
}

// Test 3: Test invalid server configuration
try {
  console.log(colors.yellow("Testing invalid server configuration..."));
  store1.createServer({
    port: -1, // Invalid port
    host: "invalid-host-name-that-does-not-exist",
  });
} catch (err) {
  if (err instanceof Error) {
    console.log(
      colors.green(`✓ Invalid server config handled: ${err.message}`)
    );
  }
}

// Test 4: Test invalid client configuration
try {
  console.log(colors.yellow("Testing invalid client configuration..."));
  store1.createClient({
    host: "non-existent-host",
    port: 99999, // Invalid port
    login: "test",
    password: "test",
  });
} catch (err) {
  if (err instanceof Error) {
    console.log(
      colors.green(`✓ Invalid client config handled: ${err.message}`)
    );
  }
}

// Test 5: Test malformed action dispatch
try {
  console.log(colors.yellow("Testing malformed action dispatch..."));
  store1.dispatch(null as any);
  console.log(colors.red("✗ Null action dispatch should have thrown error"));
} catch (err) {
  if (err instanceof Error) {
    console.log(
      colors.green(`✓ Null action properly rejected: ${err.message}`)
    );
  }
}

// Test 6: Test undefined action type
try {
  console.log(colors.yellow("Testing undefined action type..."));
  store1.dispatch({ type: undefined } as any);
  console.log(colors.red("✗ Undefined action type should have thrown error"));
} catch (err) {
  if (err instanceof Error) {
    console.log(
      colors.green(`✓ Undefined action type properly rejected: ${err.message}`)
    );
  }
}

// Test 7: Normal operation after errors
try {
  console.log(colors.yellow("Testing normal operation after errors..."));
  store1.dispatch({
    type: "TASK",
    payload: { version: "ErrorTestSuccess" },
  } as TaskAction);
  console.log(colors.green("✓ Normal operation works after error tests"));
  console.log(colors.green(`State: ${JSON.stringify(store1.getState())}`));
} catch (err) {
  if (err instanceof Error) {
    console.log(
      colors.red(`✗ Normal operation failed after errors: ${err.message}`)
    );
  }
}

// Fork worker if master
if (cluster.isPrimary) {
  console.log(colors.yellow("Forking worker for cluster error testing..."));
  cluster.fork();

  // Exit after tests complete
  setTimeout(() => {
    console.log(colors.green("Error tests completed successfully!"));
    process.exit(0);
  }, 2000);
}

// Subscribe to changes
store1.subscribe(() => {
  const name = cluster.isPrimary ? "m" : cluster.worker?.id?.toString() || "?";
  console.log(colors.green(`${name} | ${JSON.stringify(store1.getState())}`));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});
