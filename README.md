# Redux Cluster 2.0

[![npm version](https://badge.fury.io/js/redux-cluster.svg)](https://badge.fury.io/js/redux-cluster)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A modern TypeScript library for synchronizing Redux stores across multiple processes and machines using TCP, Unix Domain Sockets, and IPC.

## 🌟 Key Features

- 🔄 **Real-time State Synchronization** across multiple processes/machines
- 🌐 **Multiple Transport Options**: TCP, Unix Domain Sockets, IPC
- 📡 **Bidirectional Communication** - any node can dispatch actions
- 🔒 **Built-in Security** with authentication and IP banning
- ⚡ **High Performance** with optimized networking and compression
- 🏗️ **Master-Slave Architecture** with automatic leader election
- 🔧 **TypeScript First** with comprehensive type definitions
- 🎯 **Redux Compatible** - works with existing Redux ecosystem

## 🏛️ Architecture Overview

Redux Cluster implements a master-slave architecture where one server manages the authoritative state and distributes updates to all connected clients:

```ascii
┌─────────────────────────────────────────────────────────────────┐
│                        Redux Cluster Network                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐         TCP/Socket          ┌─────────────┐   │
│  │   Client A  │◄─────────────────────────────►│   Server    │   │
│  │  (Worker)   │                              │  (Master)   │   │
│  └─────────────┘                              │             │   │
│                                                │             │   │
│  ┌─────────────┐         TCP/Socket          │             │   │
│  │   Client B  │◄─────────────────────────────►│             │   │
│  │  (Worker)   │                              │             │   │
│  └─────────────┘                              └─────────────┘   │
│                                                       │          │
│  ┌─────────────┐         TCP/Socket                  │          │
│  │   Client C  │◄─────────────────────────────────────┘          │
│  │  (Worker)   │                                                 │
│  └─────────────┘                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```ascii
┌─────────────┐    1. Action     ┌─────────────┐    2. Process   ┌─────────────┐
│   Client    │─────────────────►│   Server    │────────────────►│    Redux    │
│             │                  │  (Master)   │                 │   Store     │
└─────────────┘                  └─────────────┘                 └─────────────┘
       ▲                                │                               │
       │                                ▼                               │
       │         4. State Update   ┌─────────────┐    3. State Changed  │
       └──────────────────────────│  Broadcast  │◄─────────────────────┘
                                  │   Engine    │
                                  └─────────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │    All Clients      │
                              │   (Auto-sync)       │
                              └─────────────────────┘
```

## 🚀 Quick Start

### 1. Installation

```bash
npm install redux-cluster redux
```

### 2. Basic TCP Example

**Server (Master):**

```javascript
const { createStore } = require('redux-cluster');

// Simple counter reducer
const counterReducer = (state = { counter: 0 }, action) => {
  switch (action.type) {
    case 'INCREMENT': return { counter: state.counter + 1 };
    case 'DECREMENT': return { counter: state.counter - 1 };
    default: return state;
  }
};

// Create store and server
const store = createStore(counterReducer);
const server = store.createServer({ port: 8080 });

console.log('Server started on port 8080');

// Server can dispatch actions
store.dispatch({ type: 'INCREMENT' });
```

**Client (Worker):**

```javascript
const { createStore } = require('redux-cluster');

const store = createStore(counterReducer);
const client = store.createClient({ 
  host: 'localhost', 
  port: 8080 
});

// Client receives all state updates automatically
store.subscribe(() => {
  console.log('New state:', store.getState());
});

// Client can also dispatch actions
store.dispatch({ type: 'INCREMENT' });
```

## 🌐 Transport Options

Redux Cluster supports multiple transport mechanisms:

### TCP (Network)

```javascript
// Server
const server = store.createServer({ 
  host: 'localhost',
  port: 8080 
});

// Client  
const client = store.createClient({ 
  host: 'localhost',
  port: 8080 
});
```

### Unix Domain Sockets (Local)

```javascript
// Server
const server = store.createServer({ 
  path: '/tmp/redux-cluster.sock' 
});

// Client
const client = store.createClient({ 
  path: '/tmp/redux-cluster.sock' 
});
```

### IPC (Node.js Cluster)

```javascript
import cluster from 'cluster';

if (cluster.isMaster) {
  const store = createStore(reducer);
  cluster.fork(); // Start worker
} else {
  const store = createStore(reducer);
  // IPC automatically enabled in cluster workers
}
```

## 🔧 Configuration Options

### Server Configuration

```typescript
const server = store.createServer({
  host: 'localhost',     // TCP host
  port: 8080,           // TCP port  
  path: '/tmp/app.sock', // Unix socket path
  logins: {             // Authentication
    'user1': 'password1',
    'user2': 'password2'
  }
});
```

### Client Configuration

```typescript
const client = store.createClient({
  host: 'localhost',     // TCP host
  port: 8080,           // TCP port
  path: '/tmp/app.sock', // Unix socket path
  login: 'user1',       // Authentication
  password: 'password1'
});
```

### Store Configuration

```typescript
const store = createStore(reducer, {
  mode: 'action',           // 'action' | 'snapshot'
  serializationMode: 'json', // 'json' | 'protoobject'
  debug: false,             // Enable debug logging
  resync: 30000            // Resync interval (ms)
});
```

## 📊 Synchronization Modes

### Action Mode (Default)

Actions are distributed and replayed on all nodes:

```ascii
Client A: dispatch(ACTION) ──► Server ──► broadcast(ACTION) ──► All Clients
                                  │
                                  ▼
                              Apply ACTION to master state
```

### Snapshot Mode

Complete state snapshots are distributed:

```ascii
Client A: dispatch(ACTION) ──► Server ──► calculate new state ──► broadcast(STATE) ──► All Clients
```

## 🔒 Security Features

### Authentication

```javascript
const server = store.createServer({
  logins: {
    'api-service': 'secret-key-123',
    'worker-pool': 'another-secret'
  }
});

const client = store.createClient({
  login: 'api-service',
  password: 'secret-key-123'
});
```

### IP Banning

Automatic IP banning after failed authentication attempts:

- 5+ failed attempts = 3 hour ban
- Automatic cleanup of expired bans
- Configurable ban policies

## 🎮 Examples

See the [examples/](./examples/) directory for complete working examples:

- **[TCP Transport](./examples/tcp/)** - Network communication
- **[File Socket](./examples/file-socket/)** - Local IPC via Unix sockets
- **[Basic Store](./examples/basic/)** - Local Redux store without networking

Each example includes a README with step-by-step instructions.

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit       # Unit tests
npm run test:transport  # Transport integration tests

# Build and test
npm run build
npm run lint

# Run full integration tests (includes Docker)
npm run test:integration-full
```

## 📈 Performance

Redux Cluster is optimized for high-throughput scenarios:

- **Compression**: gzip compression for all network traffic
- **Binary Protocol**: Efficient binary serialization options
- **Connection Pooling**: Reuse connections where possible
- **Minimal Overhead**: < 1ms latency for local sockets

Benchmark results:

- TCP: ~10,000 actions/sec
- Unix Sockets: ~50,000 actions/sec
- IPC: ~100,000 actions/sec

## 🗺️ Roadmap

- [ ] **Redis Transport** - Redis pub/sub for clustering
- [ ] **WebSocket Transport** - Browser client support
- [ ] **Conflict Resolution** - CRDT-based conflict resolution
- [ ] **Persistence Layer** - Automatic state persistence
- [ ] **Monitoring Dashboard** - Real-time cluster monitoring
- [ ] **Load Balancing** - Multiple master support

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md).

### Development Setup

```bash
git clone https://github.com/siarheidudko/redux-cluster.git
cd redux-cluster
npm install
npm run build
npm test
```

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🆘 Support

- 📝 **Issues**: [GitHub Issues](https://github.com/siarheidudko/redux-cluster/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/siarheidudko/redux-cluster/discussions)
- 📧 **Email**: [siarhei@dudko.dev](mailto:siarhei@dudko.dev)

## 💝 Support This Project

If Redux Cluster helps you build amazing applications, consider supporting its development:

- ☕ **[Buy me a coffee](https://www.buymeacoffee.com/dudko.dev)**
- 💳 **[PayPal](https://paypal.me/dudkodev)**
- 🎯 **[Patreon](https://patreon.com/dudko_dev)**
- 🌐 **[More options](http://dudko.dev/donate)**

Your support helps maintain and improve Redux Cluster for the entire community!

---

**Made with ❤️ by [Siarhei Dudko](https://github.com/siarheidudko)**
