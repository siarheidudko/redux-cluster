/**
 * Redux-Cluster Unit Tests
 * (c) 2024 by Siarhei Dudko.
 *
 * Unit tests for core functionality
 * LICENSE MIT
 */

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

  type TestAction = IncrementAction | SetMessageAction;

  const testReducer = (
    state: TestState = { counter: 0, message: "" },
    action: Action
  ): TestState => {
    switch (action.type) {
      case "INCREMENT":
        const incAction = action as IncrementAction;
        return {
          ...state,
          counter: state.counter + (incAction.payload?.amount || 1),
        };
      case "SET_MESSAGE":
        const msgAction = action as SetMessageAction;
        return {
          ...state,
          message: msgAction.payload.message,
        };
      default:
        return state;
    }
  };

  describe("Store Creation", () => {
    test("should create store with initial state", () => {
      const store = createStore(testReducer);
      expect(store.getState()).toEqual({ counter: 0, message: "" });
    });

    test("should create store with JSON serialization mode by default", () => {
      const store = createStore(testReducer);
      expect((store as any).config?.serializationMode).toBe(
        SerializationMode.JSON
      );
    });

    test("should create store with ProtoObject serialization mode when configured", () => {
      const store = createStore(testReducer, {
        serializationMode: SerializationMode.PROTOOBJECT,
      });
      expect((store as any).config?.serializationMode).toBe(
        SerializationMode.PROTOOBJECT
      );
    });
  });

  describe("Basic Redux Functionality", () => {
    let store: ReturnType<typeof createStore<TestState, TestAction>>;

    beforeEach(() => {
      store = createStore<TestState, TestAction>(testReducer);
    });

    test("should dispatch actions and update state", () => {
      store.dispatch({ type: "INCREMENT" } as IncrementAction);
      expect(store.getState().counter).toBe(1);

      store.dispatch({
        type: "INCREMENT",
        payload: { amount: 5 },
      } as IncrementAction);
      expect(store.getState().counter).toBe(6);
    });

    test("should handle multiple action types", () => {
      store.dispatch({
        type: "SET_MESSAGE",
        payload: { message: "Hello World" },
      } as SetMessageAction);
      expect(store.getState().message).toBe("Hello World");

      store.dispatch({
        type: "INCREMENT",
        payload: { amount: 10 },
      } as IncrementAction);
      expect(store.getState()).toEqual({ counter: 10, message: "Hello World" });
    });

    test("should support subscriptions", (done) => {
      const unsubscribe = store.subscribe(() => {
        expect(store.getState().counter).toBe(1);
        unsubscribe();
        done();
      });

      store.dispatch({ type: "INCREMENT" } as IncrementAction);
    });

    test("should support multiple subscriptions", () => {
      let callCount1 = 0;
      let callCount2 = 0;

      const unsubscribe1 = store.subscribe(() => callCount1++);
      const unsubscribe2 = store.subscribe(() => callCount2++);

      store.dispatch({ type: "INCREMENT" } as IncrementAction);
      store.dispatch({ type: "INCREMENT" } as IncrementAction);

      expect(callCount1).toBe(2);
      expect(callCount2).toBe(2);

      unsubscribe1();
      unsubscribe2();
    });
  });

  describe("Error Handling", () => {
    let store: ReturnType<typeof createStore<TestState, TestAction>>;

    beforeEach(() => {
      store = createStore<TestState, TestAction>(testReducer);
    });

    test("should throw error for reserved action types", () => {
      expect(() => {
        store.dispatch({ type: "REDUX_CLUSTER_SYNC" } as any);
      }).toThrow();
    });

    test("should handle null/undefined actions gracefully", () => {
      expect(() => {
        store.dispatch(null as any);
      }).toThrow();

      expect(() => {
        store.dispatch(undefined as any);
      }).toThrow();
    });

    test("should handle malformed actions", () => {
      expect(() => {
        store.dispatch({ type: undefined } as any);
      }).toThrow();

      expect(() => {
        store.dispatch({} as any);
      }).toThrow();
    });
  });

  describe("Cluster Mode Configuration", () => {
    test("should support action mode", () => {
      const store = createStore(testReducer);
      store.mode = "action";
      expect(store.mode).toBe("action");
    });

    test("should support snapshot mode", () => {
      const store = createStore(testReducer);
      store.mode = "snapshot";
      expect(store.mode).toBe("snapshot");
    });

    test("should default to snapshot mode", () => {
      const store = createStore(testReducer);
      expect(store.mode).toBe("snapshot");
    });
  });

  describe("Serialization Configuration", () => {
    test("should work with JSON mode by default", () => {
      const store = createStore(testReducer);
      store.dispatch({
        type: "SET_MESSAGE",
        payload: { message: "JSON test" },
      } as SetMessageAction);
      expect(store.getState().message).toBe("JSON test");
    });

    test("should work with ProtoObject mode when available", () => {
      const store = createStore(testReducer, {
        serializationMode: SerializationMode.PROTOOBJECT,
      });
      store.dispatch({
        type: "SET_MESSAGE",
        payload: { message: "ProtoObject test" },
      } as SetMessageAction);
      expect(store.getState().message).toBe("ProtoObject test");
    });

    test("should fallback to JSON when ProtoObject is not available", () => {
      // This test assumes ProtoObject might not be available in test environment
      const store = createStore(testReducer, {
        serializationMode: SerializationMode.PROTOOBJECT,
      });
      store.dispatch({ type: "INCREMENT" } as IncrementAction);
      expect(store.getState().counter).toBe(1);
    });
  });
});
