/**
 * Redux-Cluster Test
 * (c) 2018-2025 by Siarhei Dudko.
 *
 * Visual test for cluster IPC channel
 * LICENSE MIT
 */

const { createStore } = require("../dist/index");
const cluster = require("cluster");
const lodash = require("lodash");
const colors = require("colors");

const testTwo = true;

// Primary reducer
function editProcessStorage(
  state = { version: "", timestamp: Date.now() },
  action
) {
  try {
    switch (action.type) {
      case "TASK":
        return {
          version: action.payload.version,
          timestamp: Date.now(),
        };
      default:
        return lodash.clone(state);
    }
  } catch (e) {
    console.error("Error in editProcessStorage:", e);
    return lodash.clone(state);
  }
}

// Secondary reducer
function editProcessStorage2(
  state = { version: "", timestamp: Date.now() },
  action
) {
  try {
    switch (action.type) {
      case "TASK":
        return {
          version: action.payload.version,
          timestamp: Date.now(),
        };
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
const Test2 = testTwo ? createStore(editProcessStorage2) : null;

// Subscribe to changes with enhanced logging
Test.subscribe(() => {
  const role = cluster.isMaster ? "Master" : `Worker-${cluster.worker.id}`;
  const state = Test.getState();
  console.log(
    colors.cyan(`${role} [Test1] |`),
    colors.gray(JSON.stringify(state))
  );
});

if (testTwo && Test2) {
  Test2.subscribe(() => {
    const role = cluster.isMaster ? "Master" : `Worker-${cluster.worker.id}`;
    const state = Test2.getState();
    console.log(
      colors.yellow(`${role} [Test2] |`),
      colors.gray(JSON.stringify(state))
    );
  });
}

if (cluster.isMaster) {
  console.log(colors.blue("=".repeat(60)));
  console.log(colors.blue("MASTER PROCESS STARTED - VISUAL TEST"));
  console.log(colors.blue("=".repeat(60)));

  // Fork multiple workers with staggered timing
  const workerCount = 3;
  for (let i = 0; i < workerCount; i++) {
    setTimeout(() => {
      console.log(colors.green(`Forking worker ${i + 1}/${workerCount}...`));
      cluster.fork();
    }, i * 2000);
  }

  // Initial dispatches
  Test.dispatch({
    type: "TASK",
    payload: { version: "OneMasterTest0" },
  });

  if (testTwo && Test2) {
    Test2.dispatch({
      type: "TASK",
      payload: { version: "TwoMasterTest0" },
    });
  }

  // Regular dispatches from master
  let masterCounter = 0;
  const masterInterval = setInterval(() => {
    masterCounter++;

    Test.dispatch({
      type: "TASK",
      payload: { version: `OneMasterTest${masterCounter}` },
    });

    if (testTwo && Test2) {
      Test2.dispatch({
        type: "TASK",
        payload: { version: `TwoMasterTest${masterCounter}` },
      });
    }

    console.log(colors.blue(`Master dispatched action ${masterCounter}`));
  }, 5000);

  // Monitor cluster events
  cluster.on("online", (worker) => {
    console.log(colors.green(`Worker ${worker.process.pid} is online`));
  });

  cluster.on("exit", (worker, code, signal) => {
    console.log(
      colors.red(
        `Worker ${worker.process.pid} died with code ${code} and signal ${signal}`
      )
    );

    // Restart worker if it wasn't a graceful shutdown
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      console.log(colors.yellow("Restarting worker..."));
      cluster.fork();
    }
  });

  // Cleanup after test duration
  setTimeout(() => {
    console.log(colors.blue("\nStopping master interval..."));
    clearInterval(masterInterval);

    setTimeout(() => {
      console.log(colors.blue("Master test completed. Shutting down..."));
      process.exit(0);
    }, 10000);
  }, 60000); // Run for 1 minute
} else {
  const workerId = cluster.worker.id;
  console.log(colors.magenta(`Worker ${workerId} started`));

  // Worker-specific dispatches with unique timing
  let workerCounter = 0;
  const workerDelay = 5000 + workerId * 1000;

  const workerInterval = setInterval(() => {
    workerCounter++;

    Test.dispatch({
      type: "TASK",
      payload: { version: `OneWorkerTest${workerId}-${workerCounter}` },
    });

    if (testTwo && Test2) {
      Test2.dispatch({
        type: "TASK",
        payload: { version: `TwoWorkerTest${workerId}-${workerCounter}` },
      });
    }

    console.log(
      colors.magenta(`Worker ${workerId} dispatched action ${workerCounter}`)
    );
  }, workerDelay);

  // Stop worker after some time
  setTimeout(() => {
    console.log(colors.magenta(`Worker ${workerId} stopping interval...`));
    clearInterval(workerInterval);

    // Graceful disconnect
    setTimeout(() => {
      console.log(colors.magenta(`Worker ${workerId} disconnecting...`));
      cluster.worker.disconnect();
    }, 5000);
  }, 45000); // Run for 45 seconds
}

// Display connection status
setInterval(() => {
  const role = cluster.isMaster ? "Master" : `Worker-${cluster.worker.id}`;
  const status = Test.connected ? "CONNECTED" : "DISCONNECTED";
  const statusColor = Test.connected ? colors.green : colors.red;
  console.log(`${role} Status:`, statusColor(status));
}, 10000);

// Enhanced error handling
const originalStderr = Test.stderr;
Test.stderr = (message) => {
  console.log(colors.red("Redux-Cluster Error:"), message);
  originalStderr(message);
};

if (testTwo && Test2) {
  const originalStderr2 = Test2.stderr;
  Test2.stderr = (message) => {
    console.log(colors.red("Redux-Cluster Error (Test2):"), message);
    originalStderr2(message);
  };
}

// Graceful shutdown
process.on("SIGINT", () => {
  const role = cluster.isMaster ? "Master" : `Worker-${cluster.worker.id}`;
  console.log(colors.yellow(`\n${role} shutting down gracefully...`));
  process.exit(0);
});

process.on("SIGTERM", () => {
  const role = cluster.isMaster ? "Master" : `Worker-${cluster.worker.id}`;
  console.log(colors.yellow(`\n${role} received SIGTERM, shutting down...`));
  process.exit(0);
});
