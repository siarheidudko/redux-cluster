/**
 * Simple integration test without cluster
 */

import { createStore } from "../src/index";
import { SerializationMode } from "../src/types";
import { Action } from "redux";

interface TestState {
  counter: number;
}

interface IncrementAction extends Action<"INCREMENT"> {}

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

console.log("🧪 Running simple integration test...");

// Test 1: JSON mode
console.log("\n1️⃣ Testing JSON mode...");
const jsonStore = createStore(testReducer);
console.log("Initial state:", jsonStore.getState());
jsonStore.dispatch({ type: "INCREMENT" } as IncrementAction);
console.log("After increment:", jsonStore.getState());
console.log("✅ JSON mode test passed");

// Test 2: ProtoObject mode
console.log("\n2️⃣ Testing ProtoObject mode...");
const protoStore = createStore(testReducer, {
  serializationMode: SerializationMode.PROTOOBJECT,
});
console.log("Initial state:", protoStore.getState());
protoStore.dispatch({ type: "INCREMENT" } as IncrementAction);
console.log("After increment:", protoStore.getState());
console.log("✅ ProtoObject mode test passed");

// Test 3: Error handling
console.log("\n3️⃣ Testing error handling...");
try {
  jsonStore.dispatch({ type: "REDUX_CLUSTER_SYNC" } as any);
  console.log("❌ Should have thrown error");
} catch (e) {
  console.log("✅ Correctly rejected reserved action type");
}

// Test 4: Subscription
console.log("\n4️⃣ Testing subscriptions...");
let callCount = 0;
const unsubscribe = jsonStore.subscribe(() => {
  callCount++;
});
jsonStore.dispatch({ type: "INCREMENT" } as IncrementAction);
unsubscribe();
jsonStore.dispatch({ type: "INCREMENT" } as IncrementAction);
console.log(`Subscription called ${callCount} times (expected: 1)`);
console.log(
  callCount === 1
    ? "✅ Subscription test passed"
    : "❌ Subscription test failed"
);

console.log("\n🎉 All simple integration tests completed!");
console.log("Final JSON store state:", jsonStore.getState());
console.log("Final ProtoObject store state:", protoStore.getState());
