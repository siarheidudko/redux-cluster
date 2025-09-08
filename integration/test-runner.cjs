/* eslint-env node */
const { createStore } = require("../dist/cjs/index.js");

// Simple counter reducer for testing
function testReducer(state = { counter: 0, actions: [] }, action) {
  switch (action.type) {
    case "INCREMENT":
      return {
        ...state,
        counter: state.counter + 1,
        actions: [
          ...state.actions,
          {
            type: "INCREMENT",
            timestamp: Date.now(),
            clientId: action.clientId || "unknown",
          },
        ],
      };
    case "DECREMENT":
      return {
        ...state,
        counter: state.counter - 1,
        actions: [
          ...state.actions,
          {
            type: "DECREMENT",
            timestamp: Date.now(),
            clientId: action.clientId || "unknown",
          },
        ],
      };
    default:
      return state;
  }
}

// Configuration
const TEST_MODE = process.env.TEST_MODE || "server";
const CLIENT_ID = process.env.CLIENT_ID || "test-client";
const SERVER_HOST = process.env.SERVER_HOST || "localhost";
const SERVER_PORT = parseInt(process.env.SERVER_PORT || "13000");
const TEST_DURATION = 20000; // 20 seconds
const ACTIONS_PER_SECOND = 5;

async function runTCPServer() {
  console.log("🚀 Starting TCP Server test...");

  const store = createStore(testReducer);

  // Create server
  const server = store.createServer({
    host: "0.0.0.0",
    port: SERVER_PORT,
  });

  console.log(`✅ TCP Server listening on port ${SERVER_PORT}`);

  // Subscribe to state changes
  store.subscribe(() => {
    const state = store.getState();
    console.log(
      `Server state: counter=${state.counter}, actions=${state.actions.length}`
    );
  });

  // Keep server running for the test duration
  await new Promise((resolve) => setTimeout(resolve, TEST_DURATION));

  const finalState = store.getState();
  console.log("📊 Server Test Results:");
  console.log(`- Final counter: ${finalState.counter}`);
  console.log(`- Total actions: ${finalState.actions.length}`);

  // Graceful shutdown
  await server.close();
  console.log("✅ Server shut down gracefully");
}

async function runTCPClient() {
  console.log(`🚀 Starting TCP Client test (${CLIENT_ID})...`);

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const store = createStore(testReducer);

  // Create client
  const client = store.createClient({
    host: SERVER_HOST,
    port: SERVER_PORT,
  });

  console.log(`✅ TCP Client connecting to ${SERVER_HOST}:${SERVER_PORT}`);

  // Subscribe to state changes
  store.subscribe(() => {
    const state = store.getState();
    console.log(
      `${CLIENT_ID} state: counter=${state.counter}, actions=${state.actions.length}`
    );
  });

  // Wait for connection to be established
  await new Promise((resolve) => setTimeout(resolve, 2000));

  let actionsGenerated = 0;
  const maxActions = Math.floor((TEST_DURATION - 5000) / 1000 * ACTIONS_PER_SECOND);

  // Generate actions periodically
  const actionInterval = setInterval(() => {
    if (actionsGenerated >= maxActions) {
      clearInterval(actionInterval);
      return;
    }

    try {
      const action = Math.random() > 0.5
        ? { type: "INCREMENT", clientId: CLIENT_ID }
        : { type: "DECREMENT", clientId: CLIENT_ID };

      store.dispatch(action);
      actionsGenerated++;
    } catch (error) {
      console.error(`${CLIENT_ID} action failed:`, error);
    }
  }, 1000 / ACTIONS_PER_SECOND);

  // Wait for test to complete
  await new Promise((resolve) => setTimeout(resolve, TEST_DURATION - 3000));

  clearInterval(actionInterval);

  const finalState = store.getState();
  console.log(`📊 ${CLIENT_ID} Test Results:`);
  console.log(`- Final counter: ${finalState.counter}`);
  console.log(`- Actions generated: ${actionsGenerated}`);
  console.log(`- Total actions seen: ${finalState.actions.length}`);

  // Graceful shutdown
  await client.disconnect();
  console.log(`✅ ${CLIENT_ID} disconnected gracefully`);
}

async function runFileSocketTest() {
  console.log("🚀 Starting File Socket test...");

  const socketPath = "/tmp/redux-cluster-test.sock";

  // Server setup
  const serverStore = createStore(testReducer);
  const server = serverStore.createServer({ path: socketPath });

  console.log(`✅ File Socket server listening on ${socketPath}`);

  // Client setup
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const clientStore = createStore(testReducer);
  const client = clientStore.createClient({ path: socketPath });

  console.log("✅ File Socket client connected");

  // Subscribe to changes
  serverStore.subscribe(() => {
    const state = serverStore.getState();
    console.log(
      `Server state: counter=${state.counter}, actions=${state.actions.length}`
    );
  });

  clientStore.subscribe(() => {
    const state = clientStore.getState();
    console.log(
      `Client state: counter=${state.counter}, actions=${state.actions.length}`
    );
  });

  // Generate test actions
  let actionsGenerated = 0;
  const maxActions = Math.floor(TEST_DURATION / 1000 * ACTIONS_PER_SECOND);

  const actionInterval = setInterval(() => {
    if (actionsGenerated >= maxActions) {
      clearInterval(actionInterval);
      return;
    }

    try {
      const action = Math.random() > 0.5
        ? { type: "INCREMENT", clientId: "file-socket-client" }
        : { type: "DECREMENT", clientId: "file-socket-client" };

      clientStore.dispatch(action);
      actionsGenerated++;
    } catch (error) {
      console.error("File socket action failed:", error);
    }
  }, 1000 / ACTIONS_PER_SECOND);

  await new Promise((resolve) => setTimeout(resolve, TEST_DURATION));

  clearInterval(actionInterval);

  const finalState = serverStore.getState();
  console.log("📊 File Socket Test Results:");
  console.log(`- Final counter: ${finalState.counter}`);
  console.log(`- Actions generated: ${actionsGenerated}`);
  console.log(`- Total actions: ${finalState.actions.length}`);

  // Cleanup
  await client.disconnect();
  await server.close();
  console.log("✅ File Socket test completed");
}

async function main() {
  console.log(`Starting integration test in ${TEST_MODE} mode...`);

  try {
    switch (TEST_MODE) {
      case "server":
        await runTCPServer();
        break;
      case "client":
        await runTCPClient();
        break;
      case "file-socket":
        await runFileSocketTest();
        break;
      default:
        console.error(`Unknown test mode: ${TEST_MODE}`);
        process.exit(1);
    }

    console.log(`✅ Test ${TEST_MODE} completed successfully`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Test ${TEST_MODE} failed:`, error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

if (require.main === module) {
  main();
}
