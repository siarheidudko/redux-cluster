﻿# Redux-Cluster
Synchronize your redux storage in a cluster.

- Supports native methods of redux.
- Uses IPC only.
- Store are isolated and identified by means of hashes.

## Use

#### connection library
```
	var ReduxCluster = require('redux-cluster');
```

#### create store
```
	var Test = ReduxCluster.createStore(editProcessStorage);
	
	function editProcessStorage(state = {version:''}, action){ 
		switch (action.type){
			case 'TASK':
				var state_new = {};
				state_new.version = action.payload.version;
				return state_new;
				break;
			default:
				break;
		}
	}
```

#### subscribe updates
```
	Test.subscribe(function(){
		if(Cluster.isMaster){
			var name = 'm';
		} else {
			var name = Cluster.worker.id;
		}
		console.log(Colors.gray(name + ' | ' + JSON.stringify(Test.getState())));
	});
```

#### dispatch event
```
	Test.dispatch({type:'TASK', payload: {version:'1111111'}})
```
