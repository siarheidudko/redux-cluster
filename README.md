﻿
# Redux-Cluster  
Synchronize your redux storage in a cluster.  
  
- Supports native methods of redux.  
- Uses IPC only.  
- Store are isolated and identified by means of hashes.  

## Install  

```
	npm i redux-cluster --save
```

## Use  

### Stability: 2 - Stable  

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

### Stability: 1 - Experimental  

#### create socket server  
```
Test.createServer(<Options>);
```
   
Options <Object> Required:  

- path <String> - name of the file socket (linux) or the name of the named pipe (windows), if use as IPC  
- host <String> - hostname or ip-address (optional, default 0.0.0.0), if use as TCP  
- port <Integer> - port (optional, default 10001), if use as TCP  
- logins <Object> - login - password pairs as `{login1:password1, login2:password2}`

#### create socket server  
```
Test.createClient(<Options>);
```
   
Options <Object> Required:  

- path <String> - name of the file socket (linux) or the name of the named pipe (windows), if use as IPC  
- host <String> - hostname or ip-address (optional, default 0.0.0.0), if use as TCP  
- port <Integer> - port (optional, default 10001), if use as TCP  
- login <String> - login in socket
- password <String> - password in socket


## LICENSE  
  
MIT  
