const ACTIONS_PER_SECOND = 5;
const TEST_DURATION = 25000; // 25 seconds (shorter than main test)

let currentState = { counter: 0, actions: [] };
let workerId = process.pid;

// Handle messages from master
process.on('message', (message) => {
  switch (message.type) {
    case 'INIT':
      currentState = message.state;
      console.log(`Worker ${workerId} initialized with state:`, currentState);
      startGeneratingActions();
      break;
    case 'STATE_UPDATE':
      currentState = message.state;
      break;
  }
});

function startGeneratingActions() {
  let actionsGenerated = 0;
  const maxActions = Math.floor(TEST_DURATION / 1000 * ACTIONS_PER_SECOND);
  
  const interval = setInterval(() => {
    if (actionsGenerated >= maxActions) {
      clearInterval(interval);
      console.log(`Worker ${workerId} finished generating ${actionsGenerated} actions`);
      return;
    }

    const action = Math.random() > 0.5 
      ? { type: 'INCREMENT', clientId: `ipc-worker-${workerId}` }
      : { type: 'DECREMENT', clientId: `ipc-worker-${workerId}` };

    // Send action to master
    process.send({
      type: 'ACTION',
      action: action
    });

    actionsGenerated++;
  }, 1000 / ACTIONS_PER_SECOND);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log(`Worker ${workerId} received SIGTERM`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`Worker ${workerId} received SIGINT`);
  process.exit(0);
});
