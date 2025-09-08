/**
 * Simple integration test without cluster
 */

import { test } from "node:test";
import assert from "node:assert";
import { createStore } from "../src/index";
import { SerializationMode } from "../src/types";
import { Action } from "redux";

interface TestState {
  counter: number;
}

interface IncrementAction extends Action<"INCREMENT"> {
  type: "INCREMENT";
}

const testReducer = (
  state: TestState = { counter: 0 },
  action: Action
): TestState => {
  switch (action.type) {
    case "INCREMENT":
      return { ...state, counter: state.counter + 1 };
    default:
      return state;
  }
};

test("JSON mode basic functionality", () => {
  const jsonStore = createStore(testReducer);

  assert.deepEqual(
    jsonStore.getState(),
    { counter: 0 },
    "Initial state should be counter: 0"
  );

  jsonStore.dispatch({ type: "INCREMENT" } as IncrementAction);
  assert.deepEqual(
    jsonStore.getState(),
    { counter: 1 },
    "After increment should be counter: 1"
  );
});

test("ProtoObject mode basic functionality", () => {
  const protoStore = createStore(testReducer, {
    serializationMode: SerializationMode.PROTOOBJECT,
  });

  assert.deepEqual(
    protoStore.getState(),
    { counter: 0 },
    "Initial state should be counter: 0"
  );

  protoStore.dispatch({ type: "INCREMENT" } as IncrementAction);
  assert.deepEqual(
    protoStore.getState(),
    { counter: 1 },
    "After increment should be counter: 1"
  );
});

test("Error handling for reserved action type", () => {
  const jsonStore = createStore(testReducer);

  assert.throws(
    () => {
      jsonStore.dispatch({ type: "REDUX_CLUSTER_SYNC" } as any);
    },
    /Please don't use REDUX_CLUSTER_SYNC action type!/,
    "Should throw error for reserved action type"
  );
});

test("Subscription functionality", () => {
  const jsonStore = createStore(testReducer);
  let callCount = 0;

  const unsubscribe = jsonStore.subscribe(() => {
    callCount++;
  });

  jsonStore.dispatch({ type: "INCREMENT" } as IncrementAction);
  assert.equal(callCount, 1, "Subscription should be called once");

  unsubscribe();

  jsonStore.dispatch({ type: "INCREMENT" } as IncrementAction);
  assert.equal(
    callCount,
    1,
    "Subscription should not be called after unsubscribe"
  );
});
