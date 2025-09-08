import { test } from "node:test";
import assert from "node:assert";
import { createStore } from "../src/index";

const testReducer = (state = { counter: 0 }, action: any) => {
  switch (action.type) {
    case "INCREMENT":
      return { counter: state.counter + 1 };
    case "DECREMENT":
      return { counter: state.counter - 1 };
    default:
      return state;
  }
};

test("should create a store with default state", () => {
  const store = createStore(testReducer);
  assert.deepStrictEqual(store.getState(), { counter: 0 });
});

test("should handle actions", () => {
  const store = createStore(testReducer);
  store.dispatch({ type: "INCREMENT" });
  assert.deepStrictEqual(store.getState(), { counter: 1 });
});

test("should have cluster properties", () => {
  const store = createStore(testReducer);
  assert.ok(store.RCHash);
  assert.ok(store.version);
  assert.ok(store.role.includes("master"));
  assert.strictEqual(typeof store.createServer, "function");
  assert.strictEqual(typeof store.createClient, "function");
});

test("should support different sync modes", () => {
  const store = createStore(testReducer);
  assert.strictEqual(store.mode, "action");

  store.mode = "snapshot";
  assert.strictEqual(store.mode, "snapshot");
});

test("should handle subscriptions", async () => {
  const store = createStore(testReducer);

  return new Promise<void>((resolve) => {
    const unsubscribe = store.subscribe(() => {
      assert.deepStrictEqual(store.getState(), { counter: 1 });
      unsubscribe();
      resolve();
    });

    store.dispatch({ type: "INCREMENT" });
  });
});
