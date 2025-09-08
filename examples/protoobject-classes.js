/**
 * Proper ProtoObject example with custom classes
 * Shows how to use Redux-Cluster with custom ProtoObject classes
 */

const { createStore, SerializationMode } = require("../dist/index.js");
const { ProtoObject } = require("protoobject");
const cluster = require("cluster");

// Custom ProtoObject classes that extend the base ProtoObject
class AppState extends ProtoObject {
  constructor(data = {}) {
    super({
      counter: 0,
      users: new UserList(),
      metadata: new AppMetadata(),
      ...data,
    });
  }

  incrementCounter() {
    return new AppState({
      ...this,
      counter: this.counter + 1,
    });
  }
}

class UserList extends ProtoObject {
  constructor(data = {}) {
    super({
      items: [],
      lastUpdated: Date.now(),
      ...data,
    });
  }

  addUser(userData) {
    return new UserList({
      items: [...this.items, new User(userData)],
      lastUpdated: Date.now(),
    });
  }
}

class User extends ProtoObject {
  constructor(data = {}) {
    super({
      id: Math.random().toString(36).substr(2, 9),
      name: "Unknown",
      email: "",
      ...data,
    });
  }

  updateEmail(email) {
    return new User({
      ...this,
      email: email,
    });
  }
}

class AppMetadata extends ProtoObject {
  constructor(data = {}) {
    super({
      version: "1.0.0",
      lastAction: "",
      actionCount: 0,
      ...data,
    });
  }

  updateAction(actionType) {
    return new AppMetadata({
      ...this,
      lastAction: actionType,
      actionCount: this.actionCount + 1,
    });
  }
}

// Reducer
function appReducer(state = new AppState(), action) {
  // Always ensure we have proper class instances
  if (!(state instanceof AppState)) {
    state = new AppState(state);
    if (state.users && !(state.users instanceof UserList)) {
      state.users = new UserList(state.users);
      if (Array.isArray(state.users.items)) {
        state.users.items = state.users.items.map((item) =>
          item instanceof User ? item : new User(item)
        );
      }
    }
    if (state.metadata && !(state.metadata instanceof AppMetadata)) {
      state.metadata = new AppMetadata(state.metadata);
    }
  }

  switch (action.type) {
    case "INCREMENT":
      const newState = state.incrementCounter();
      newState.metadata = state.metadata.updateAction("INCREMENT");
      return newState;

    case "ADD_USER":
      const stateWithUser = new AppState({
        ...state,
        users: state.users.addUser(action.payload),
      });
      stateWithUser.metadata = state.metadata.updateAction("ADD_USER");
      return stateWithUser;

    default:
      return state;
  }
}

// Create store with ProtoObject serialization mode
const store = createStore(appReducer, {
  serializationMode: SerializationMode.PROTOOBJECT,
  debug: true,
});

console.log("Serialization mode:", store.config.serializationMode);

// IMPORTANT: Register all custom classes
store.registerClass("AppState", AppState);
store.registerClass("UserList", UserList);
store.registerClass("User", User);
store.registerClass("AppMetadata", AppMetadata);

console.log("Registered classes:", store.getRegisteredClasses());

// Subscribe to changes
store.subscribe(() => {
  const state = store.getState();
  const processType = cluster.isPrimary
    ? "Master"
    : `Worker-${cluster.worker?.id}`;

  console.log(`[${processType}] State update:`, {
    counter: state.counter,
    userCount: state.users?.items?.length || 0,
    lastAction: state.metadata?.lastAction,
    actionCount: state.metadata?.actionCount,
    // Check if instances are properly restored
    stateClass: state.constructor.name,
    usersClass: state.users?.constructor.name,
    metadataClass: state.metadata?.constructor.name,
    // Check if methods are available
    hasIncrementMethod: typeof state.incrementCounter === "function",
    hasAddUserMethod: typeof state.users?.addUser === "function",
  });
});

if (cluster.isPrimary) {
  console.log("=== Starting Master Process ===");

  // Fork workers
  cluster.fork();

  // Dispatch actions from master
  let counter = 0;
  const interval = setInterval(() => {
    counter++;

    if (counter <= 10) {
      // Limit to prevent infinite running
      if (counter % 3 === 0) {
        store.dispatch({
          type: "ADD_USER",
          payload: {
            name: `Master User ${counter}`,
            email: `master${counter}@test.com`,
          },
        });
      } else {
        store.dispatch({ type: "INCREMENT" });
      }
    } else {
      console.log("Master: Stopping after 10 actions");
      clearInterval(interval);
      setTimeout(() => process.exit(0), 2000);
    }
  }, 1000);
} else {
  console.log(`=== Worker ${cluster.worker.id} Started ===`);

  // Dispatch from worker
  setTimeout(() => {
    store.dispatch({
      type: "ADD_USER",
      payload: {
        name: `Worker ${cluster.worker.id} User`,
        email: `worker${cluster.worker.id}@test.com`,
      },
    });
  }, 2000);
}
