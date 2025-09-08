# Redux Cluster Examples

This directory contains working examples demonstrating different transport modes and use cases for Redux Cluster.

## Available Examples

### 🌐 [TCP Transport](./tcp/)
- **Server-Client Architecture**: One master server, multiple TCP clients
- **Network Communication**: Works across different machines
- **Port**: localhost:8080
- **Use Case**: Distributed applications, microservices

### 📁 [File Socket Transport](./file-socket/)
- **Unix Domain Sockets**: High-performance local communication
- **Local Only**: Same machine communication
- **Socket File**: `/tmp/redux-cluster-example.sock`
- **Use Case**: Multi-process applications, worker processes

### ⚡ [Basic Store](./basic/)
- **Local Redux Store**: No networking, just enhanced Redux
- **Educational**: Shows core Redux Cluster features
- **Use Case**: Learning, local state management

## Quick Start

1. **Build the project first**:
```bash
cd ../..
npm run build
```

2. **Choose an example**:
```bash
# TCP Example
cd tcp
node server.cjs  # Terminal 1
node client.cjs client-1  # Terminal 2

# File Socket Example  
cd file-socket
node server.cjs  # Terminal 1
node client.cjs client-1  # Terminal 2

# Basic Store Example
cd basic
node store.cjs
```

## Architecture Overview

```ascii
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   TCP Example   │  │File Socket Ex.  │  │  Basic Store    │
│                 │  │                 │  │                 │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
│  │  Server   │  │  │  │  Server   │  │  │  │   Store   │  │
│  │   :8080   │  │  │  │   .sock   │  │  │  │   Local   │  │
│  └─────┬─────┘  │  │  └─────┬─────┘  │  │  └───────────┘  │
│        │        │  │        │        │  │                 │
│  ┌─────▼─────┐  │  │  ┌─────▼─────┐  │  │                 │
│  │ Client 1  │  │  │  │ Client 1  │  │  │                 │
│  └───────────┘  │  │  └───────────┘  │  │                 │
│  ┌─────▲─────┐  │  │  ┌─────▲─────┐  │  │                 │
│  │ Client 2  │  │  │  │ Client 2  │  │  │                 │
│  └───────────┘  │  │  └───────────┘  │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
    Network I/O          File System           In-Memory
   Cross-machine           Local IPC          Single Process
```

## Key Concepts

- **Master-Slave Architecture**: One server manages state, clients synchronize
- **Bidirectional Sync**: Both server and clients can dispatch actions
- **Real-time Updates**: State changes propagate immediately
- **Transport Agnostic**: Same API for TCP, File Sockets, and IPC

## Next Steps

1. **Try the examples** to understand the concepts
2. **Read the main README** for full API documentation  
3. **Check the integration tests** for advanced scenarios
4. **Build your own application** using these patterns
