/**
 * Redux-Cluster Error Test (TypeScript)
 * (c) 2024 by Siarhei Dudko.
 *
 * Test error handling and edge cases
 * LICENSE MIT
 */

import { test } from "node:test";
import assert from "node:assert";
import { createStore } from "../src/index";
import { Action } from "redux";

interface TestState {
  version: string;
}

interface TaskAction extends Action<"TASK"> {
  payload: { version: string };
}

// Reducer for error testing
function errorTestReducer(
  state: TestState = { version: "" },
  action: Action
): TestState {
  switch (action.type) {
    case "TASK": {
      const taskAction = action as TaskAction;
      return { version: taskAction.payload.version };
    }
    default:
      return state;
  }
}

test("Reserved action type should throw error", () => {
  const store = createStore(errorTestReducer);

  assert.throws(
    () => {
      store.dispatch({
        type: "REDUX_CLUSTER_SYNC",
        payload: { test: 1 },
      } as any);
    },
    /Please don't use REDUX_CLUSTER_SYNC action type!/,
    "Should throw error for reserved action type"
  );
});

test("Null action dispatch should be handled", () => {
  const store = createStore(errorTestReducer);

  assert.throws(() => {
    store.dispatch(null as any);
  }, "Should throw error for null action");
});

test("Undefined action type should be handled", () => {
  const store = createStore(errorTestReducer);

  assert.throws(() => {
    store.dispatch({ type: undefined } as any);
  }, "Should throw error for undefined action type");
});

test("Normal operation after error handling", () => {
  const store = createStore(errorTestReducer);

  // First try an invalid action
  assert.throws(() => {
    store.dispatch({ type: "REDUX_CLUSTER_SYNC" } as any);
  });

  // Then try a valid action
  store.dispatch({
    type: "TASK",
    payload: { version: "ErrorTestSuccess" },
  } as TaskAction);

  assert.deepEqual(
    store.getState(),
    { version: "ErrorTestSuccess" },
    "Store should work normally after error"
  );
});

test("Multiple stores with different reducer names should work", () => {
  const reducer1 = function testReducer1(
    state: TestState = { version: "" },
    _action: Action
  ): TestState {
    return state;
  };

  const reducer2 = function testReducer2(
    state: TestState = { version: "" },
    _action: Action
  ): TestState {
    return state;
  };

  // Both stores should be created successfully with different reducer names
  const store1 = createStore(reducer1);
  const store2 = createStore(reducer2);

  assert.ok(store1, "First store should be created");
  assert.ok(store2, "Second store should be created");
  assert.notEqual(
    store1.RCHash,
    store2.RCHash,
    "Stores should have different hashes"
  );
});
