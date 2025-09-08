import { createStore } from "../src/index";

describe("ReduxCluster", () => {
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

  it("should create a store with default state", () => {
    const store = createStore(testReducer);
    expect(store.getState()).toEqual({ counter: 0 });
  });

  it("should handle actions", () => {
    const store = createStore(testReducer);
    store.dispatch({ type: "INCREMENT" });
    expect(store.getState()).toEqual({ counter: 1 });
  });

  it("should have cluster properties", () => {
    const store = createStore(testReducer);
    expect(store.RCHash).toBeDefined();
    expect(store.version).toBeDefined();
    expect(store.role).toEqual(expect.arrayContaining(["master"]));
    expect(typeof store.createServer).toBe("function");
    expect(typeof store.createClient).toBe("function");
  });

  it("should support different sync modes", () => {
    const store = createStore(testReducer);
    expect(store.mode).toBe("action");

    store.mode = "snapshot";
    expect(store.mode).toBe("snapshot");
  });

  it("should handle subscriptions", (done) => {
    const store = createStore(testReducer);
    const unsubscribe = store.subscribe(() => {
      expect(store.getState()).toEqual({ counter: 1 });
      unsubscribe();
      done();
    });

    store.dispatch({ type: "INCREMENT" });
  });
});
