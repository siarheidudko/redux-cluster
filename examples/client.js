const { createStore } = require("../dist/index");
const cluster = require("cluster");

function clientStateReducer(
  state = {
    data: [],
    clientId: Math.random().toString(36).substr(2, 9),
    connected: false,
  },
  action
) {
  switch (action.type) {
    case "ADD_DATA":
      return {
        ...state,
        data: [...state.data, action.payload],
      };
    case "CLEAR_DATA":
      return {
        ...state,
        data: [],
      };
    case "SET_CONNECTION":
      return {
        ...state,
        connected: action.payload,
      };
    default:
      return state;
  }
}

const store = createStore(clientStateReducer);
store.mode = "action";

if (cluster.isMaster) {
  console.log("Client Master process started");

  // Connect to TCP server
  const client = store.createClient({
    host: "localhost",
    port: 8888,
    login: "client1",
    password: "password1",
  });

  console.log("Connecting to TCP server on localhost:8888");

  // Fork worker processes
  for (let i = 0; i < 1; i++) {
    setTimeout(() => {
      console.log(`Forking worker ${i + 1}`);
      cluster.fork();
    }, i * 3000);
  }

  // Master client actions
  let dataCounter = 0;
  setInterval(() => {
    if (store.connected) {
      store.dispatch({
        type: "ADD_DATA",
        payload: {
          id: ++dataCounter,
          source: "master",
          timestamp: Date.now(),
          data: `Master data ${dataCounter}`,
        },
      });
      console.log(
        `Master client sent data ${dataCounter}, connected: ${store.connected}`
      );
    } else {
      console.log("Master client not connected to server");
    }
  }, 7000);
} else {
  console.log(`Client Worker ${cluster.worker.id} started`);

  // Connect to IPC server
  const client = store.createClient({
    path: "./worker_1.sock",
    login: "worker",
    password: "worker123",
  });

  console.log(`Worker ${cluster.worker.id} connecting to IPC server`);

  // Worker client actions
  let workerDataCounter = 0;
  setInterval(() => {
    if (store.connected) {
      store.dispatch({
        type: "ADD_DATA",
        payload: {
          id: `w${cluster.worker.id}_${++workerDataCounter}`,
          source: `worker${cluster.worker.id}`,
          timestamp: Date.now(),
          data: `Worker ${cluster.worker.id} data ${workerDataCounter}`,
        },
      });
      console.log(
        `Worker ${cluster.worker.id} sent data, connected: ${store.connected}`
      );
    } else {
      console.log(`Worker ${cluster.worker.id} not connected to server`);
    }
  }, 12000 + cluster.worker.id * 3000);
}

// Monitor connection status
setInterval(() => {
  const role = cluster.isMaster ? "Master" : `Worker ${cluster.worker.id}`;
  console.log(
    `${role} client status: ${store.connected ? "CONNECTED" : "DISCONNECTED"}`
  );
}, 5000);

// Subscribe to all changes
store.subscribe(() => {
  const role = cluster.isMaster ? "Master" : `Worker ${cluster.worker.id}`;
  const state = store.getState();
  console.log(`${role} - State updated:`, {
    clientId: state.clientId,
    dataCount: state.data.length,
    connected: state.connected,
    lastData: state.data[state.data.length - 1]?.data || "none",
  });
});

// Handle connection status changes
const originalStderr = store.stderr;
store.stderr = (message) => {
  console.log("Connection error:", message);
  originalStderr(message);
};

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Client shutting down gracefully...");
  process.exit(0);
});
