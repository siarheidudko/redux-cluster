const { createStore } = require("../dist/index");
const cluster = require("cluster");

function appStateReducer(
  state = {
    users: [],
    messages: [],
    lastUpdate: Date.now(),
  },
  action
) {
  switch (action.type) {
    case "ADD_USER":
      return {
        ...state,
        users: [...state.users, action.payload],
        lastUpdate: Date.now(),
      };
    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.payload],
        lastUpdate: Date.now(),
      };
    case "REMOVE_USER":
      return {
        ...state,
        users: state.users.filter((user) => user.id !== action.payload.id),
        lastUpdate: Date.now(),
      };
    default:
      return state;
  }
}

const store = createStore(appStateReducer);
store.mode = "action";

if (cluster.isMaster) {
  console.log("Server Master process started");

  // Create TCP server on master
  const server = store.createServer({
    host: "0.0.0.0",
    port: 8888,
    logins: {
      admin: "secret123",
      client1: "password1",
      client2: "password2",
    },
  });

  console.log("TCP server listening on port 8888");

  // Fork worker processes
  for (let i = 0; i < 2; i++) {
    setTimeout(() => {
      console.log(`Forking worker ${i + 1}`);
      cluster.fork();
    }, i * 2000);
  }

  // Master actions
  let userIdCounter = 0;
  setInterval(() => {
    store.dispatch({
      type: "ADD_USER",
      payload: {
        id: ++userIdCounter,
        name: `MasterUser${userIdCounter}`,
        timestamp: Date.now(),
      },
    });
    console.log("Master added user, current state:", {
      userCount: store.getState().users.length,
      messageCount: store.getState().messages.length,
    });
  }, 10000);
} else {
  console.log(`Server Worker ${cluster.worker.id} started`);

  // Create IPC socket server on worker
  const server = store.createServer({
    path: `./worker_${cluster.worker.id}.sock`,
    logins: {
      worker: "worker123",
      test: "test123",
    },
  });

  console.log(`Worker ${cluster.worker.id} IPC server created`);

  // Worker actions
  let messageCounter = 0;
  setInterval(() => {
    store.dispatch({
      type: "ADD_MESSAGE",
      payload: {
        id: `worker${cluster.worker.id}_${++messageCounter}`,
        text: `Message from worker ${cluster.worker.id}`,
        timestamp: Date.now(),
      },
    });
  }, 8000 + cluster.worker.id * 2000);
}

// Subscribe to all changes
store.subscribe(() => {
  const role = cluster.isMaster ? "Master" : `Worker ${cluster.worker.id}`;
  console.log(`${role} - State updated:`, {
    users: store.getState().users.length,
    messages: store.getState().messages.length,
    lastUpdate: new Date(store.getState().lastUpdate).toISOString(),
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Server shutting down gracefully...");
  process.exit(0);
});
