# Basic Store Example

This example demonstrates a simple Redux store without any networking - just the core Redux functionality with Redux Cluster's enhanced features.

## What This Example Shows

- Basic Redux store creation with Redux Cluster
- Local state management without networking
- Redux Cluster's enhanced store features
- Todo list application with multiple action types

## Files

- `store.cjs` - Basic Redux store with todo list logic

## Running the Example

```bash
# From the project root
node examples/basic/store.cjs
```

## What You'll See

The example creates a todo list store and demonstrates:

1. **Store Creation** - Setting up a Redux store with Redux Cluster
2. **Action Dispatching** - Adding, completing, and removing todos
3. **State Subscription** - Listening to state changes
4. **Complex State** - Managing structured data (todos with IDs and status)

## Expected Output

```bash
🚀 Basic Redux Cluster Store Example
📊 Initial state: { "todos": [], "nextId": 1 }
🎯 Dispatching actions...
📈 State updated: Total todos: 1, Completed: 0, Pending: 1
📋 Todo List: ⏳ [1] Learn Redux Cluster
# ... more todo operations
🏁 Example completed!
```

## Key Concepts

This example demonstrates the foundation concepts before moving to networked examples:

- **Redux Integration** - How Redux Cluster enhances standard Redux stores
- **Action Handling** - Processing multiple action types (ADD_TODO, COMPLETE_TODO, etc.)
- **Subscription Model** - Reacting to state changes with real-time updates

Once you understand these basics, check out the networked examples:

- [TCP Transport](../tcp/) - Network communication between processes
- [File Socket](../file-socket/) - Local IPC via Unix sockets
