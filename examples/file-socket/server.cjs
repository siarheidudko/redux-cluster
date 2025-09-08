const { createStore } = require("../../dist/cjs/index");
const path = require("path");
const os = require("os");

// Simple counter reducer
function counterReducer(state = { counter: 0, history: [] }, action) {
  switch (action.type) {
    case "INCREMENT":
      return {
        counter: state.counter + 1,
        history: [...state.history, `INCREMENT at ${new Date().toISOString()}`]
      };
    case "DECREMENT":
      return {
        counter: state.counter - 1,
        history: [...state.history, `DECREMENT at ${new Date().toISOString()}`]
      };
    case "RESET":
      return {
        counter: 0,
        history: [...state.history, `RESET at ${new Date().toISOString()}`]
      };
    default:
      return state;
  }
}

const socketPath = path.join(os.tmpdir(), 'redux-cluster-example.sock');

console.log("🚀 Starting File Socket Server...");
console.log(`📁 Socket path: ${socketPath}`);

// Create store
const store = createStore(counterReducer);

// Create server with file socket
const server = store.createServer({ 
  path: socketPath
});

console.log("✅ File Socket Server started");
console.log("📊 Initial state:", store.getState());

// Subscribe to state changes
store.subscribe(() => {
  const state = store.getState();
  console.log("📈 State updated:", {
    counter: state.counter,
    lastAction: state.history[state.history.length - 1] || 'None'
  });
});

// Simulate some server-side actions
let actionCounter = 0;
const serverActions = setInterval(() => {
  actionCounter++;
  store.dispatch({ type: "INCREMENT" });
  console.log(`🎯 Server dispatched action #${actionCounter}`);
  
  if (actionCounter >= 5) {
    clearInterval(serverActions);
    console.log("🔄 Server finished dispatching actions. Waiting for clients...");
  }
}, 2000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  clearInterval(serverActions);
  await server.close();
  console.log('✅ Server closed gracefully');
  process.exit(0);
});

console.log("💡 Run client to see synchronization in action!");
console.log("💡 Use Ctrl+C to stop the server");
