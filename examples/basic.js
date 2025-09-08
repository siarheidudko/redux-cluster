const { createStore } = require("../dist/index");
const cluster = require("cluster");

// Define a simple reducer
function counterReducer(state = { counter: 0 }, action) {
  switch (action.type) {
    case "INCREMENT":
      return { counter: state.counter + 1 };
    case "DECREMENT":
      return { counter: state.counter - 1 };
    default:
      return state;
  }
}

// Create a Redux Cluster store
const store = createStore(counterReducer);
store.mode = "action";

if (cluster.isMaster) {
  console.log("Master process started");

  // Fork workers
  for (let i = 0; i < 2; i++) {
    setTimeout(() => {
      console.log(`Forking worker ${i + 1}`);
      cluster.fork();
    }, i * 1000);
  }

  // Dispatch actions from master
  let counter = 0;
  setInterval(() => {
    store.dispatch({ type: "INCREMENT" });
    console.log(
      `Master dispatched INCREMENT ${++counter}, state:`,
      store.getState()
    );
  }, 3000);

  // Subscribe to state changes
  store.subscribe(() => {
    console.log("Master - State changed:", store.getState());
  });
} else {
  console.log(`Worker ${cluster.worker.id} started`);

  // Dispatch actions from worker
  let workerCounter = 0;
  setInterval(() => {
    store.dispatch({ type: "INCREMENT" });
    console.log(
      `Worker ${cluster.worker.id} dispatched INCREMENT ${++workerCounter}`
    );
  }, 5000 + cluster.worker.id * 1000);

  // Subscribe to state changes
  store.subscribe(() => {
    console.log(
      `Worker ${cluster.worker.id} - State changed:`,
      store.getState()
    );
  });
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  process.exit(0);
});
