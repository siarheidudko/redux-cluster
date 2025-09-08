# File Socket Transport Example

This example demonstrates how to use Redux Cluster with Unix Domain Sockets for high-performance local communication between processes.

## Overview

- **Server**: Creates a Unix domain socket file in system temp directory  
- **Clients**: Connect to the same socket file for local IPC

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
```

## What You'll See

1. **Server** creates socket file (e.g., `/tmp/redux-cluster-example.sock`)
2. **Server** dispatches some initial INCREMENT actions
3. **Clients** connect via the socket file and receive synchronized state
4. **Clients** send random INCREMENT/DECREMENT actions
5. **All instances** stay synchronized in real-time

## Architecture

```ascii
┌─────────────┐
│   Client 1  │
└──────┬──────┘
       │
       │ Unix Socket
       │ /tmp/redux-cluster-example.sock  
       │
┌──────▼──────┐    ┌─────────────┐
│   Server    │◄───┤   Client 2  │
│  (Master)   │    └─────────────┘
└─────────────┘
```

## Key Features

- **High Performance**: Unix sockets are faster than TCP for local communication
- **Local Only**: Only processes on the same machine can connect
- **File-based**: Uses a file in the temp directory as connection point
- **Automatic Cleanup**: Socket file is removed when server shuts down

## Use Cases

Perfect for:
- Multi-process applications on the same machine
- Worker processes that need shared state
- Local microservices communication
- Development and testing scenarios
