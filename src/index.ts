import {
  Reducer,
  Action,
  combineReducers,
  bindActionCreators,
  applyMiddleware,
  compose,
} from "redux";
import { ReduxCluster } from "./core/redux-cluster.js";
import { ReduxClusterConfig } from "./types/index.js";
import { hasher } from "./utils/crypto.js";

// Re-export Redux functions and types
export * from "redux";

// Export our types
export * from "./types/index.js";

// Export utility functions
export const functions = {
  hasher,
};

// Main function to create a ReduxCluster store
export function createStore<S = any, A extends Action = Action>(
  reducer: Reducer<S, A>,
  config?: ReduxClusterConfig
): ReduxCluster<S, A> {
  return new ReduxCluster<S, A>(reducer, config);
}

// Default export for CommonJS compatibility
export default {
  createStore,
  functions,
  // Re-export Redux
  combineReducers,
  bindActionCreators,
  applyMiddleware,
  compose,
};
