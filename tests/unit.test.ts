/**
 * Redux-Cluster Unit Tests
 * (c) 2024 by Siarhei Dudko.
 *
 * Unit tests for core functionality
 * LICENSE MIT
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { createStore } from "../src/index";
import { SerializationMode } from "../src/types";
import { Action } from "redux";

describe("Redux-Cluster Core", () => {
  interface TestState {
    counter: number;
    message: string;
  }

  interface IncrementAction extends Action<"INCREMENT"> {
    payload?: { amount: number };
  }

  interface SetMessageAction extends Action<"SET_MESSAGE"> {
    payload: { message: string };
  }

  const testReducer = (
    state: TestState = { counter: 0, message: "" },
    action: Action
  ): TestState => {
    switch (action.type) {
      case "INCREMENT": {
        const incAction = action as IncrementAction;
        return {
          ...state,
          counter: state.counter + (incAction.payload?.amount || 1),
        };
      }
      case "SET_MESSAGE": {
        const msgAction = action as SetMessageAction;
        return {
          ...state,
          message: msgAction.payload.message,
        };
      }
      default:
        return state;
    }
  };

  describe("Store Creation", () => {
    test("should create store with initial state", () => {
      const store = createStore(testReducer);
      assert.deepEqual(store.getState(), { counter: 0, message: "" });
    });

    test("should create store with JSON serialization mode by default", () => {
      const store = createStore(testReducer);
      assert.equal(
        (store as any).config?.serializationMode,
        SerializationMode.JSON
      );
    });

    test("should create store with ProtoObject serialization mode when configured", () => {
      const store = createStore(testReducer, {
        serializationMode: SerializationMode.PROTOOBJECT,
      });
      assert.equal(
        (store as any).config?.serializationMode,
        SerializationMode.PROTOOBJECT
      );
    });
  });

  describe("Basic Redux Functionality", () => {
    test("should dispatch actions and update state", () => {
      const store = createStore(testReducer);

      store.dispatch({ type: "INCREMENT" } as IncrementAction);
      assert.equal(store.getState().counter, 1);

      store.dispatch({
        type: "INCREMENT",
        payload: { amount: 5 },
      } as IncrementAction);
      assert.equal(store.getState().counter, 6);
    });

    test("should handle multiple action types", () => {
      const store = createStore(testReducer);

      store.dispatch({
        type: "SET_MESSAGE",
        payload: { message: "Hello World" },
      } as SetMessageAction);
      assert.equal(store.getState().message, "Hello World");

      store.dispatch({
        type: "INCREMENT",
        payload: { amount: 10 },
      } as IncrementAction);
      assert.deepEqual(store.getState(), {
        counter: 10,
        message: "Hello World",
      });
    });

    test("should support subscriptions", (t, done) => {
      const store = createStore(testReducer);

      const unsubscribe = store.subscribe(() => {
        assert.equal(store.getState().counter, 1);
        unsubscribe();
        done();
      });

      store.dispatch({ type: "INCREMENT" } as IncrementAction);
    });

    test("should support multiple subscriptions", () => {
      const store = createStore(testReducer);
      let callCount1 = 0;
      let callCount2 = 0;

      const unsubscribe1 = store.subscribe(() => callCount1++);
      const unsubscribe2 = store.subscribe(() => callCount2++);

      store.dispatch({ type: "INCREMENT" } as IncrementAction);
      store.dispatch({ type: "INCREMENT" } as IncrementAction);

      assert.equal(callCount1, 2);
      assert.equal(callCount2, 2);

      unsubscribe1();
      unsubscribe2();
    });
  });

  describe("Error Handling", () => {
    test("should throw error for reserved action types", () => {
      const store = createStore(testReducer);

      assert.throws(() => {
        store.dispatch({ type: "REDUX_CLUSTER_SYNC" } as any);
      });
    });

    test("should handle null/undefined actions gracefully", () => {
      const store = createStore(testReducer);

      assert.throws(() => {
        store.dispatch(null as any);
      });

      assert.throws(() => {
        store.dispatch(undefined as any);
      });
    });

    test("should handle malformed actions", () => {
      const store = createStore(testReducer);

      assert.throws(() => {
        store.dispatch({ type: undefined } as any);
      });

      assert.throws(() => {
        store.dispatch({} as any);
      });
    });
  });

  describe("Cluster Mode Configuration", () => {
    test("should support action mode", () => {
      const store = createStore(testReducer);
      store.mode = "action";
      assert.equal(store.mode, "action");
    });

    test("should support snapshot mode", () => {
      const store = createStore(testReducer);
      store.mode = "snapshot";
      assert.equal(store.mode, "snapshot");
    });

    test("should default to action mode", () => {
      const store = createStore(testReducer);
      assert.equal(store.mode, "action");
    });
  });

  describe("Serialization Configuration", () => {
    test("should work with JSON mode by default", () => {
      const store = createStore(testReducer);
      store.dispatch({
        type: "SET_MESSAGE",
        payload: { message: "JSON test" },
      } as SetMessageAction);
      assert.equal(store.getState().message, "JSON test");
    });

    test("should work with ProtoObject mode when available", () => {
      const store = createStore(testReducer, {
        serializationMode: SerializationMode.PROTOOBJECT,
      });
      store.dispatch({
        type: "SET_MESSAGE",
        payload: { message: "ProtoObject test" },
      } as SetMessageAction);
      assert.equal(store.getState().message, "ProtoObject test");
    });

    test("should fallback to JSON when ProtoObject is not available", () => {
      const store = createStore(testReducer, {
        serializationMode: SerializationMode.PROTOOBJECT,
      });
      store.dispatch({ type: "INCREMENT" } as IncrementAction);
      assert.equal(store.getState().counter, 1);
    });
  });
});
