const { createStore } = require("../../dist/cjs/index");
const path = require("path");
const os = require("os");

// Same reducer as server
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
const clientId = process.argv[2] || 'client-1';

console.log(`🚀 Starting File Socket Client: ${clientId}`);
console.log(`📁 Connecting to socket: ${socketPath}`);

// Create store
const store = createStore(counterReducer);

// Connect to server via file socket
const client = store.createClient({ 
  path: socketPath
});

console.log(`✅ Client ${clientId} connecting to file socket`);

// Subscribe to state changes
store.subscribe(() => {
  const state = store.getState();
  console.log(`📈 [${clientId}] State synchronized:`, {
    counter: state.counter,
    lastAction: state.history[state.history.length - 1] || 'None'
  });
});

// Wait a bit, then start sending actions
setTimeout(() => {
  console.log(`🎯 [${clientId}] Starting to send actions...`);
  
  let actionCounter = 0;
  const clientActions = setInterval(() => {
    actionCounter++;
    const actions = ['INCREMENT', 'DECREMENT'];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    
    store.dispatch({ type: randomAction });
    console.log(`💡 [${clientId}] Sent ${randomAction} #${actionCounter}`);
    
    if (actionCounter >= 3) {
      clearInterval(clientActions);
      console.log(`🏁 [${clientId}] Finished sending actions`);
    }
  }, 3000 + Math.random() * 2000); // Random interval to avoid conflicts
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n🛑 [${clientId}] Shutting down...`);
    clearInterval(clientActions);
    client.disconnect();
    console.log(`✅ [${clientId}] Disconnected gracefully`);
    process.exit(0);
  });
  
}, 2000);

console.log(`💡 [${clientId}] Use Ctrl+C to stop the client`);
