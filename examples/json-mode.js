/**
 * Example using JSON serialization mode (default)
 * Works without ProtoObject dependency
 */

const { createStore, SerializationMode } = require("../dist/index.js");
const cluster = require("cluster");

// Simple state structure with plain objects
function createInitialState() {
  return {
    counter: 0,
    users: [],
    metadata: {
      version: "1.0.0",
      lastAction: "",
      actionCount: 0,
    },
  };
}

// Reducer using regular JavaScript objects
function appReducer(state = createInitialState(), action) {
  switch (action.type) {
    case "INCREMENT":
      return {
        ...state,
        counter: state.counter + 1,
        metadata: {
          ...state.metadata,
          lastAction: "INCREMENT",
          actionCount: state.metadata.actionCount + 1,
        },
      };

    case "ADD_USER":
      return {
        ...state,
        users: [
          ...state.users,
          {
            id: Math.random().toString(36).substr(2, 9),
            name: action.payload.name,
            email: action.payload.email,
          },
        ],
        metadata: {
          ...state.metadata,
          lastAction: "ADD_USER",
          actionCount: state.metadata.actionCount + 1,
        },
      };

    default:
      return state;
  }
}

// Create store with JSON serialization (default mode)
const store = createStore(appReducer, {
  serializationMode: SerializationMode.JSON,
  debug: true,
});

console.log("Serialization mode:", store.config.serializationMode);
console.log("ProtoObject methods available:", {
  registerClass: typeof store.registerClass,
  getRegisteredClasses: typeof store.getRegisteredClasses,
});

// Subscribe to changes
store.subscribe(() => {
  const state = store.getState();
  const processType = cluster.isPrimary
    ? "Master"
    : `Worker-${cluster.worker?.id}`;

  console.log(`[${processType}] State:`, {
    counter: state.counter,
    userCount: state.users.length,
    lastAction: state.metadata.lastAction,
    actionCount: state.metadata.actionCount,
    // Check object types
    stateType: typeof state,
    stateConstructor: state.constructor.name,
    usersType: Array.isArray(state.users) ? "Array" : typeof state.users,
  });
});

if (cluster.isPrimary) {
  console.log("=== JSON Mode Example - Master Process ===");

  // Fork worker
  cluster.fork();

  // Dispatch actions
  let counter = 0;
  const interval = setInterval(() => {
    counter++;

    if (counter <= 5) {
      if (counter % 2 === 0) {
        store.dispatch({
          type: "ADD_USER",
          payload: {
            name: `JSON User ${counter}`,
            email: `json${counter}@test.com`,
          },
        });
      } else {
        store.dispatch({ type: "INCREMENT" });
      }
    } else {
      console.log("Master: Completed JSON mode test");
      clearInterval(interval);
      setTimeout(() => process.exit(0), 1000);
    }
  }, 1000);
} else {
  console.log(`=== Worker ${cluster.worker.id} Started ===`);

  // Worker dispatch
  setTimeout(() => {
    store.dispatch({
      type: "ADD_USER",
      payload: { name: `JSON Worker User`, email: `worker@test.com` },
    });
  }, 2500);
}
