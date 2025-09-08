const { createStore } = require('../dist/cjs/index.js');
const http = require('http');
const fs = require('fs');
const { fork } = require('child_process');

// Test configuration
const TEST_DURATION = 30000; // 30 seconds
const ACTIONS_PER_SECOND = 10;
const SUCCESS_THRESHOLD = 0.9; // 90% success rate

// Test modes
const TEST_MODE = process.env.TEST_MODE || 'server';
const CLIENT_ID = process.env.CLIENT_ID || 'test-client';
const SERVER_HOST = process.env.SERVER_HOST || 'localhost';
const SERVER_PORT = process.env.SERVER_PORT || 13000;

// Shared state for tracking
let totalActions = 0;
let successfulActions = 0;
let failedActions = 0;

// Simple reducer for testing
function testReducer(state = { counter: 0, actions: [] }, action) {
  switch (action.type) {
    case 'INCREMENT':
      return {
        ...state,
        counter: state.counter + 1,
        actions: [...state.actions, { type: 'INCREMENT', timestamp: Date.now(), clientId: action.clientId }]
      };
    case 'DECREMENT':
      return {
        ...state,
        counter: state.counter - 1,
        actions: [...state.actions, { type: 'DECREMENT', timestamp: Date.now(), clientId: action.clientId }]
      };
    case 'RESET':
      return { counter: 0, actions: [] };
    default:
      return state;
  }
}

// TCP Server test scenario
async function runTCPServerTest() {
  console.log('🚀 Starting TCP Server test...');
  
  const store = createStore(testReducer, {
    mode: 'server',
    port: SERVER_PORT,
    serialization: 'json'
  });

  // Health check endpoint
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        counter: store.getState().counter,
        totalActions,
        successfulActions,
        failedActions
      }));
    } else if (req.url === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        totalActions,
        successfulActions,
        failedActions,
        successRate: totalActions > 0 ? (successfulActions / totalActions) : 0,
        state: store.getState()
      }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(SERVER_PORT, () => {
    console.log(`TCP Server listening on port ${SERVER_PORT}`);
  });

  // Subscribe to store changes
  store.subscribe(() => {
    const state = store.getState();
    console.log(`Server state updated: counter=${state.counter}, actions=${state.actions.length}`);
  });

  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION));

  const finalState = store.getState();
  const successRate = totalActions > 0 ? (successfulActions / totalActions) : 0;

  console.log('📊 TCP Server Test Results:');
  console.log(`Final counter: ${finalState.counter}`);
  console.log(`Total actions processed: ${finalState.actions.length}`);
  console.log(`Success rate: ${(successRate * 100).toFixed(2)}%`);

  server.close();
  return successRate >= SUCCESS_THRESHOLD;
}

// TCP Client test scenario
async function runTCPClientTest() {
  console.log(`🚀 Starting TCP Client test (${CLIENT_ID})...`);
  
  // Wait a bit for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  const store = createStore(testReducer, {
    mode: 'client',
    host: SERVER_HOST,
    port: SERVER_PORT,
    serialization: 'json'
  });

  let localSuccessful = 0;
  let localFailed = 0;
  let localTotal = 0;

  // Subscribe to store changes to track synchronization
  store.subscribe(() => {
    const state = store.getState();
    console.log(`${CLIENT_ID} state updated: counter=${state.counter}`);
  });

  // Generate actions
  const actionInterval = setInterval(() => {
    try {
      const action = Math.random() > 0.5 
        ? { type: 'INCREMENT', clientId: CLIENT_ID }
        : { type: 'DECREMENT', clientId: CLIENT_ID };
      
      store.dispatch(action);
      localTotal++;
      localSuccessful++;
    } catch (error) {
      console.error(`${CLIENT_ID} action failed:`, error);
      localFailed++;
      localTotal++;
    }
  }, 1000 / ACTIONS_PER_SECOND);

  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
  
  clearInterval(actionInterval);

  // Get final stats from server
  try {
    const statsData = await new Promise((resolve, reject) => {
      const req = http.get(`http://${SERVER_HOST}:${SERVER_PORT}/stats`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
    });
    
    console.log(`📊 ${CLIENT_ID} Test Results:`, statsData);
    return statsData.successRate >= SUCCESS_THRESHOLD;
  } catch (error) {
    console.error(`${CLIENT_ID} failed to get final stats:`, error);
    return false;
  }
}

// File Socket test scenario
async function runFileSocketTest() {
  console.log('🚀 Starting File Socket test...');
  
  const socketPath = '/tmp/redux-cluster-test.sock';
  
  // Clean up any existing socket
  try {
    fs.unlinkSync(socketPath);
  } catch (e) {
    // Ignore if file doesn't exist
  }

  // Create server process
  const serverStore = createStore(testReducer, {
    mode: 'server',
    path: socketPath,
    serialization: 'json'
  });

  // Create client processes
  const clients = [];
  const numClients = 3;
  
  for (let i = 0; i < numClients; i++) {
    const clientStore = createStore(testReducer, {
      mode: 'client',
      path: socketPath,
      serialization: 'json'
    });
    clients.push(clientStore);
  }

  let localSuccessful = 0;
  let localFailed = 0;
  let localTotal = 0;

  // Subscribe to server store
  serverStore.subscribe(() => {
    const state = serverStore.getState();
    console.log(`File Socket server state: counter=${state.counter}, actions=${state.actions.length}`);
  });

  // Generate actions from clients
  const intervals = clients.map((client, index) => {
    return setInterval(() => {
      try {
        const action = Math.random() > 0.5 
          ? { type: 'INCREMENT', clientId: `file-client-${index}` }
          : { type: 'DECREMENT', clientId: `file-client-${index}` };
        
        client.dispatch(action);
        localTotal++;
        localSuccessful++;
      } catch (error) {
        console.error(`File client ${index} action failed:`, error);
        localFailed++;
        localTotal++;
      }
    }, 1000 / ACTIONS_PER_SECOND);
  });

  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION));
  
  intervals.forEach(clearInterval);

  const finalState = serverStore.getState();
  const successRate = localTotal > 0 ? (localSuccessful / localTotal) : 0;

  console.log('📊 File Socket Test Results:');
  console.log(`Final counter: ${finalState.counter}`);
  console.log(`Total actions: ${localTotal}`);
  console.log(`Success rate: ${(successRate * 100).toFixed(2)}%`);

  // Cleanup
  try {
    fs.unlinkSync(socketPath);
  } catch (e) {
    // Ignore
  }

  return successRate >= SUCCESS_THRESHOLD;
}

// IPC test scenario
async function runIPCTest() {
  console.log('🚀 Starting IPC test...');
  
  // Fork child processes for IPC communication
  const numWorkers = 3;
  const workers = [];
  let localSuccessful = 0;
  let localFailed = 0;
  let localTotal = 0;

  // Create master store
  const masterStore = createStore(testReducer, {
    mode: 'action',
    serialization: 'json'
  });

  masterStore.subscribe(() => {
    const state = masterStore.getState();
    console.log(`IPC Master state: counter=${state.counter}, actions=${state.actions.length}`);
  });

  // Create worker processes
  for (let i = 0; i < numWorkers; i++) {
    const worker = fork('./scenarios/ipc-worker.cjs');
    workers.push(worker);

    worker.on('message', (message) => {
      if (message.type === 'ACTION') {
        try {
          masterStore.dispatch(message.action);
          localSuccessful++;
        } catch (error) {
          console.error(`IPC action failed:`, error);
          localFailed++;
        }
        localTotal++;
      }
    });

    // Send current state to worker
    worker.send({
      type: 'INIT',
      state: masterStore.getState()
    });

    // Subscribe to state changes and broadcast to workers
    masterStore.subscribe(() => {
      worker.send({
        type: 'STATE_UPDATE',
        state: masterStore.getState()
      });
    });
  }

  // Wait for test duration
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION));

  // Terminate workers
  workers.forEach(worker => worker.kill());

  const finalState = masterStore.getState();
  const successRate = localTotal > 0 ? (localSuccessful / localTotal) : 0;

  console.log('📊 IPC Test Results:');
  console.log(`Final counter: ${finalState.counter}`);
  console.log(`Total actions: ${localTotal}`);
  console.log(`Success rate: ${(successRate * 100).toFixed(2)}%`);

  return successRate >= SUCCESS_THRESHOLD;
}

// Main test runner
async function main() {
  console.log(`Starting integration test in ${TEST_MODE} mode...`);
  
  let testPassed = false;

  try {
    switch (TEST_MODE) {
      case 'server':
        testPassed = await runTCPServerTest();
        break;
      case 'client':
        testPassed = await runTCPClientTest();
        break;
      case 'file-socket':
        testPassed = await runFileSocketTest();
        break;
      case 'ipc':
        testPassed = await runIPCTest();
        break;
      default:
        console.error(`Unknown test mode: ${TEST_MODE}`);
        process.exit(1);
    }

    console.log(`\n🎯 Test ${TEST_MODE} ${testPassed ? 'PASSED' : 'FAILED'}`);
    process.exit(testPassed ? 0 : 1);
    
  } catch (error) {
    console.error(`Test ${TEST_MODE} failed with error:`, error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

if (require.main === module) {
  main();
}
