/**
 * Redux-Cluster Test
 * // Enhanced reducer with better state management
function editProcessStorage(state = { versions: [] }, action) {
  try {
    switch (action.type) {
      case "TASK":
        const newState = deepClone(state);
        if (newState.versions.length > 500) {
          newState.versions.splice(0, 100);
        }
        newState.versions.push(action.payload.version);
        return newState;
      default:
        return deepClone(state);
    }
  } catch (e) {
    console.error('Error in editProcessStorage:', e);
    return deepClone(state);
  }
}arhei Dudko.
 *
 * Automated test for cluster IPC channel
 * LICENSE MIT
 */

const { createStore } = require("../dist/index");
const cluster = require("cluster");

// Utility function for deep cloning
function deepClone(obj) {
  if (typeof structuredClone !== "undefined") {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

// ANSI color codes for console output
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`,
};

// Enhanced reducer with better state management
function editProcessStorage(state = { versions: [] }, action) {
  try {
    switch (action.type) {
      case "TASK":
        const newState = lodash.clone(state);
        if (newState.versions.length > 500) {
          newState.versions.splice(0, 100);
        }
        newState.versions.push(action.payload.version);
        return newState;
      default:
        return lodash.clone(state);
    }
  } catch (e) {
    console.error("Error in editProcessStorage:", e);
    return lodash.clone(state);
  }
}

// Secondary reducer for comparison
function editProcessStorage2(state = { versions: [] }, action) {
  try {
    switch (action.type) {
      case "UPDATE":
        const newState = lodash.clone(state);
        newState.versions = action.payload.versions;
        return newState;
      default:
        return lodash.clone(state);
    }
  } catch (e) {
    console.error("Error in editProcessStorage2:", e);
    return lodash.clone(state);
  }
}

// Create stores
const Test = createStore(editProcessStorage);
Test.mode = "action";
const Test2 = createStore(editProcessStorage2);

if (cluster.isMaster) {
  console.log("Master process started - Automated Test");

  // Fork worker after a delay
  setTimeout(() => {
    console.log("Forking worker process...");
    cluster.fork();
  }, 2000);

  // Initial dispatch
  Test.dispatch({ type: "TASK", payload: { version: "MasterTest0" } });

  // Regular dispatches from master
  let masterCounter = 0;
  const masterInterval = setInterval(() => {
    masterCounter++;
    Test.dispatch({
      type: "TASK",
      payload: { version: `MasterTest${masterCounter}` },
    });

    if (masterCounter > 100) {
      console.log("Master completed 100 actions, stopping...");
      clearInterval(masterInterval);
    }
  }, 55);

  // Monitor worker lifecycle
  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`
    );
  });
} else {
  console.log(`Worker ${cluster.worker.id} started`);

  // Initial dispatch from worker
  Test.dispatch({ type: "TASK", payload: { version: "WorkerTest0" } });

  // Regular dispatches from worker
  let workerCounter = 0;
  const workerInterval = setInterval(() => {
    workerCounter++;
    Test.dispatch({
      type: "TASK",
      payload: { version: `WorkerTest${workerCounter}` },
    });

    if (workerCounter > 50) {
      console.log("Worker completed 50 actions, stopping...");
      clearInterval(workerInterval);
    }
  }, 99);

  // Sync Test2 with Test state changes
  Test.subscribe(() => {
    Test2.dispatch({
      type: "UPDATE",
      payload: { versions: Test.getState().versions },
    });
  });
}

// Only master runs the comparison test
if (cluster.isMaster) {
  let okCount = 0;
  let badCount = 0;
  let testStartTime = Date.now();

  console.log("Starting synchronization test...");

  const testInterval = setInterval(() => {
    const test1State = Test.getState().versions;
    const test2State = Test2.getState().versions;

    if (lodash.isEqual(test1State, test2State)) {
      okCount++;
      const successRate = Math.round((okCount * 100) / (okCount + badCount));
      console.log(
        colors.green(
          `✓ Sync OK: ${okCount} | Success Rate: ${successRate}% | Items: ${test1State.length}`
        )
      );
    } else {
      badCount++;
      const failureRate = Math.round((badCount * 100) / (okCount + badCount));
      console.log(
        colors.red(
          `✗ Sync FAIL: ${badCount} | Failure Rate: ${failureRate}% | T1: ${test1State.length}, T2: ${test2State.length}`
        )
      );

      // Detailed comparison for debugging
      if (badCount <= 5) {
        const diff1 = test1State.filter((x) => !test2State.includes(x));
        const diff2 = test2State.filter((x) => !test1State.includes(x));
        console.log("Differences - T1 only:", diff1.slice(-3));
        console.log("Differences - T2 only:", diff2.slice(-3));
      }
    }

    // Stop test after 2 minutes or if too many failures
    const runTime = Date.now() - testStartTime;
    if (runTime > 120000 || badCount > 20) {
      clearInterval(testInterval);

      const totalTests = okCount + badCount;
      const finalSuccessRate =
        totalTests > 0 ? Math.round((okCount * 100) / totalTests) : 0;

      console.log("\n" + "=".repeat(50));
      console.log("FINAL TEST RESULTS:");
      console.log(`Total Tests: ${totalTests}`);
      console.log(`Successful: ${okCount}`);
      console.log(`Failed: ${badCount}`);
      console.log(`Success Rate: ${finalSuccessRate}%`);
      console.log(`Runtime: ${Math.round(runTime / 1000)}s`);

      if (finalSuccessRate >= 95) {
        console.log(colors.green("TEST PASSED ✓"));
      } else {
        console.log(colors.red("TEST FAILED ✗"));
      }
      console.log("=".repeat(50));

      // Graceful shutdown
      setTimeout(() => {
        process.exit(finalSuccessRate >= 95 ? 0 : 1);
      }, 1000);
    }
  }, 1000);
}

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("\nShutting down test gracefully...");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
