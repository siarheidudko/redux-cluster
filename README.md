# Redux-Cluster 2.0

[![npm version](https://badge.fury.io/js/redux-cluster.svg)](https://badge.fury.io/js/redux-cluster)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

A modern TypeScript library for synchronizing Redux stores across Node.js cluster processes using IPC and TCP/Socket connections.

## 🚀 Features

- **Full TypeScript support** with comprehensive type definitions
- **Cluster IPC synchronization** between master and worker processes
- **TCP/Socket networking** for distributed Redux stores
- **Multiple sync modes**: action-based and snapshot-based synchronization
- **Built-in authentication** with login/password support for socket connections
- **Automatic reconnection** with configurable retry logic
- **IP-based ban system** for security
- **State persistence** with backup/restore functionality
- **Encryption support** for secure data transmission
- **Modern architecture** with separation of concerns

## 📦 Installation

```bash
npm install redux-cluster redux
```

## 🏗️ Architecture

Redux-Cluster 2.0 features a completely rewritten architecture:

```
src/
├── core/           # Core Redux-Cluster logic
├── network/        # Server and client implementations  
├── types/          # TypeScript type definitions
└── utils/          # Utility functions and crypto
```

## 🎯 Quick Start

### Basic Cluster Usage

```typescript
import { createStore } from 'redux-cluster';
import cluster from 'cluster';

// Define your reducer
const counterReducer = (state = { count: 0 }, action: any) => {
  switch (action.type) {
    case 'INCREMENT':
      return { count: state.count + 1 };
    default:
      return state;
  }
};

// Create Redux-Cluster store
const store = createStore(counterReducer);
store.mode = 'action'; // or 'snapshot'

if (cluster.isMaster) {
  // Fork workers
  cluster.fork();
  cluster.fork();
  
  // Dispatch actions - automatically synced to workers
  setInterval(() => {
    store.dispatch({ type: 'INCREMENT' });
    console.log('Master state:', store.getState());
  }, 2000);
} else {
  // Workers automatically receive state updates
  store.subscribe(() => {
    console.log(`Worker ${cluster.worker.id} state:`, store.getState());
  });
}
```

### TCP Server Example

```typescript
import { createStore } from 'redux-cluster';

const store = createStore(yourReducer);

// Create TCP server
const server = store.createServer({
  host: '0.0.0.0',
  port: 8888,
  logins: {
    'client1': 'password123',
    'admin': 'supersecret'
  }
});

console.log('Redux server listening on port 8888');
```

### TCP Client Example  

```typescript
import { createStore } from 'redux-cluster';

const store = createStore(yourReducer);

// Connect to TCP server
const client = store.createClient({
  host: 'localhost',
  port: 8888,
  login: 'client1',
  password: 'password123'
});

// Actions are now sent to server
store.dispatch({ type: 'SOME_ACTION' });
```

### Unix Socket (IPC) Example

```typescript
// Server
const server = store.createServer({
  path: './redis-cluster.sock',
  logins: { 'user': 'pass' }
});

// Client  
const client = store.createClient({
  path: './redis-cluster.sock',
  login: 'user',
  password: 'pass'  
});
```

## 🔧 Configuration

### Store Configuration

```typescript
const store = createStore(reducer);

// Sync mode: 'action' (default) or 'snapshot'
store.mode = 'action';

// Resync interval (actions between full state sync)
store.resync = 1000;

// Error handler
store.stderr = (message: string) => {
  console.error('Redux-Cluster:', message);
};
```

### Server Settings

```typescript
interface ServerSettings {
  host?: string;        // TCP host (default: '0.0.0.0')
  port?: number;        // TCP port (default: 10001)  
  path?: string;        // Unix socket path
  logins?: Record<string, string>; // Authentication
}
```

### Client Settings

```typescript
interface ClientSettings {
  host?: string;        // TCP host
  port?: number;        // TCP port (default: 10001)
  path?: string;        // Unix socket path  
  login?: string;       // Authentication login
  password?: string;    // Authentication password
}
```

## 💾 State Persistence

```typescript
// Backup configuration
const backupSettings = {
  path: './state-backup.json',
  key: 'encryption-key',     // Optional encryption
  timeout: 30,               // Backup every 30 seconds
  count: 100                 // Or backup every 100 actions
};

// Initialize backup
store.backup(backupSettings)
  .then(() => console.log('Backup initialized'))
  .catch(err => console.error('Backup failed:', err));
```

## 🔒 Security Features

- **Authentication**: Login/password protection for socket connections
- **IP Ban System**: Automatic blocking after failed authentication attempts  
- **Encryption**: Optional AES-256-CTR encryption for data transmission
- **Compression**: Built-in gzip compression for network efficiency

## 📊 Sync Modes

### Action Mode (Default)
Actions are synchronized in real-time across all connected instances.

```typescript
store.mode = 'action';
```

### Snapshot Mode  
Complete state snapshots are sent on each change.

```typescript
store.mode = 'snapshot';
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Watch mode
npm run build:watch

# Lint code
npm run lint
```

## 📚 Examples

Check out the `/examples` directory:

- `basic.js` - Simple cluster synchronization
- `server.js` - TCP server with multiple clients
- `client.js` - TCP client connecting to server

Run examples:

```bash
# Build first
npm run build

# Run examples
npm run example:basic
npm run example:server  
npm run example:client
```

## 🧪 Testing

```bash
# Unit tests
npm test

# Integration tests  
node tests/auto.test.js
node tests/visual.test.js

# Coverage
npm run test:coverage
```

## 🔄 Migration from 1.x

Redux-Cluster 2.0 maintains API compatibility but adds TypeScript support:

```typescript
// 1.x (JavaScript)
const ReduxCluster = require('redux-cluster');
const store = ReduxCluster.createStore(reducer);

// 2.x (TypeScript compatible)
import { createStore } from 'redux-cluster';
const store = createStore(reducer);
// or
const { createStore } = require('redux-cluster');
```

## 📋 Requirements

- Node.js >= 14.0.0
- Redux >= 4.0.0

## 📄 License

MIT © [Siarhei Dudko](https://github.com/siarheidudko)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)  
5. Open a Pull Request

## 📞 Support

- 📧 Email: siarhei.dudko@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/siarheidudko/redux-cluster/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/siarheidudko/redux-cluster/discussions)

---

**Made with ❤️ for the Node.js and Redux community**
