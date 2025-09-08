/**
 * Transport Integration Tests
 * Tests TCP, File Socket, and IPC synchronization
 */

import { test } from "node:test";
import assert from "node:assert";
import { createStore } from "../src/index";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";

// Simple counter reducer for testing
const counterReducer = (state = { counter: 0 }, action: any) => {
  switch (action.type) {
    case "INCREMENT":
      return { counter: state.counter + 1 };
    default:
      return state;
  }
};

test('TCP Transport synchronization', { timeout: 10000 }, async (_t) => {
  let masterServer, slaveClient;
  
  try {
    // Create master instance with server
    const master = createStore(counterReducer);
    const slave = createStore(counterReducer);

    // Start master server
    masterServer = master.createServer({ port: 8081 });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Connect slave as client to master
    slaveClient = slave.createClient({ 
      host: 'localhost', 
      port: 8081 
    });

    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test synchronization - slave sends action to master
    slave.dispatch({ type: 'INCREMENT' });
    
    // Wait for synchronization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    assert.equal(master.getState().counter, 1, 'Master should have incremented counter');
    assert.equal(slave.getState().counter, 1, 'Slave should have synchronized counter');
    
  } finally {
    // Clean up connections
    if (slaveClient) {
      slaveClient.disconnect();
    }
    if (masterServer) {
      masterServer.close();
    }
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
});

test('File Socket Transport synchronization', { timeout: 10000 }, async (_t) => {
  let masterServer, slaveClient;
  const socketPath = path.join(os.tmpdir(), `redux-cluster-test-${process.pid}-${Date.now()}.sock`);
  
  try {
    // Create master instance with server
    const master = createStore(counterReducer);
    const slave = createStore(counterReducer);

    // Start master server on file socket
    masterServer = master.createServer({ path: socketPath });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Connect slave as client to master
    slaveClient = slave.createClient({ path: socketPath });

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test synchronization
    slave.dispatch({ type: 'INCREMENT' });
    
    // Wait for synchronization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    assert.equal(master.getState().counter, 1, 'Master should have incremented counter');
    assert.equal(slave.getState().counter, 1, 'Slave should have synchronized counter');
    
  } finally {
    // Clean up connections
    if (slaveClient) {
      try { slaveClient.disconnect(); } catch { /* ignore */ }
    }
    if (masterServer) {
      try { await masterServer.close(); } catch { /* ignore */ }
    }
    
    // Clean up socket file
    try {
      await fs.unlink(socketPath);
    } catch {
      // Ignore if file doesn't exist
    }
    
    // Wait a moment for OS to release resources
    await new Promise(resolve => setTimeout(resolve, 200));
  }
});
