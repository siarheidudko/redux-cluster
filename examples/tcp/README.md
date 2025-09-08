# TCP Transport Example

This example demonstrates how to use Redux Cluster with TCP transport for real-time state synchronization between a server and multiple clients.

## Overview

- **Server**: Runs on `localhost:8080`, manages the master state
- **Clients**: Connect to the server and synchronize state bidirectionally

## Running the Example

1. **Start the server** (in one terminal):
```bash
node server.cjs
```

2. **Start one or more clients** (in separate terminals):
```bash
# Start first client
node client.cjs client-1

# Start second client  
node client.cjs client-2

# Start third client
node client.cjs client-3
```

## What You'll See

1. **Server** starts and dispatches some initial INCREMENT actions
2. **Clients** connect and receive the synchronized state
3. **Clients** start sending random INCREMENT/DECREMENT actions
4. **All instances** (server + clients) stay synchronized in real-time

## Architecture

```
┌─────────────┐    TCP:8080    ┌─────────────┐
│   Client 1  │◄──────────────►│   Server    │
└─────────────┘                │  (Master)   │
┌─────────────┐    TCP:8080    │             │
│   Client 2  │◄──────────────►│             │
└─────────────┘                └─────────────┘
┌─────────────┐    TCP:8080
│   Client 3  │◄──────────────►
└─────────────┘
```

## Key Features

- **Real-time synchronization**: All actions are immediately distributed
- **Bidirectional**: Both server and clients can dispatch actions
- **Multi-client**: Multiple clients can connect simultaneously
- **Graceful shutdown**: Use Ctrl+C to stop server/clients cleanly
