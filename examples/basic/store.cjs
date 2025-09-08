const { createStore } = require("../../dist/cjs/index");

// Simple todo list reducer
function todosReducer(state = { todos: [], nextId: 1 }, action) {
  switch (action.type) {
    case "ADD_TODO":
      return {
        ...state,
        todos: [
          ...state.todos,
          {
            id: state.nextId,
            text: action.payload.text,
            completed: false,
            createdAt: new Date().toISOString()
          }
        ],
        nextId: state.nextId + 1
      };
    case "TOGGLE_TODO":
      return {
        ...state,
        todos: state.todos.map(todo =>
          todo.id === action.payload.id
            ? { ...todo, completed: !todo.completed }
            : todo
        )
      };
    case "REMOVE_TODO":
      return {
        ...state,
        todos: state.todos.filter(todo => todo.id !== action.payload.id)
      };
    default:
      return state;
  }
}

console.log("🚀 Basic Redux Cluster Store Example");
console.log("=====================================");

// Create a basic Redux Cluster store (no networking)
const store = createStore(todosReducer);

console.log("📊 Initial state:", JSON.stringify(store.getState(), null, 2));

// Subscribe to state changes
const unsubscribe = store.subscribe(() => {
  const state = store.getState();
  console.log("\n📈 State updated:");
  console.log(`📝 Total todos: ${state.todos.length}`);
  console.log(`✅ Completed: ${state.todos.filter(t => t.completed).length}`);
  console.log(`⏳ Pending: ${state.todos.filter(t => !t.completed).length}`);
  
  if (state.todos.length > 0) {
    console.log("\n📋 Todo List:");
    state.todos.forEach(todo => {
      const status = todo.completed ? "✅" : "⏳";
      console.log(`  ${status} [${todo.id}] ${todo.text}`);
    });
  }
  console.log("─".repeat(50));
});

// Simulate some actions
console.log("\n🎯 Dispatching actions...\n");

// Add some todos
store.dispatch({
  type: "ADD_TODO",
  payload: { text: "Learn Redux Cluster" }
});

setTimeout(() => {
  store.dispatch({
    type: "ADD_TODO", 
    payload: { text: "Build awesome app" }
  });
}, 1000);

setTimeout(() => {
  store.dispatch({
    type: "ADD_TODO",
    payload: { text: "Deploy to production" }
  });
}, 2000);

// Complete first todo
setTimeout(() => {
  console.log("🎯 Completing first todo...\n");
  store.dispatch({
    type: "TOGGLE_TODO",
    payload: { id: 1 }
  });
}, 3000);

// Add another todo
setTimeout(() => {
  store.dispatch({
    type: "ADD_TODO",
    payload: { text: "Write documentation" }
  });
}, 4000);

// Complete second todo
setTimeout(() => {
  console.log("🎯 Completing second todo...\n");
  store.dispatch({
    type: "TOGGLE_TODO", 
    payload: { id: 2 }
  });
}, 5000);

// Remove completed todos
setTimeout(() => {
  console.log("🎯 Removing completed todos...\n");
  const state = store.getState();
  const completedTodos = state.todos.filter(t => t.completed);
  
  completedTodos.forEach(todo => {
    store.dispatch({
      type: "REMOVE_TODO",
      payload: { id: todo.id }
    });
  });
}, 6000);

// Cleanup and exit
setTimeout(() => {
  console.log("\n🏁 Example completed!");
  console.log("💡 This was a basic Redux store without networking.");
  console.log("💡 Check the tcp/ and file-socket/ examples for distributed state!");
  
  unsubscribe();
  process.exit(0);
}, 7000);

console.log("💡 Watch the state changes as actions are dispatched...");
