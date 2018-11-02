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
  
#### Connection library  
    
```
	var ReduxCluster = require('redux-cluster');
```
  
#### Create store  
    
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
  
#### Subscribe updates  
   
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
  
#### Dispatch event  
  
```
	Test.dispatch({type:'TASK', payload: {version:'1111111'}})
```
   
### Stability: 1 - Experimental   
In connection with the library architecture, you must use createClient immediately after creating the redux store  
(before using the functions subscribe, getState, dispath, etc., as they will be redefined)  
Please familiarize yourself with the architectural schemes before use.  
  
#### Create socket server  
  
```
Test.createServer(<Options>);
```
   
Options <Object> Required:  
  
- path <String> - name of the file socket (linux) or the name of the named channel (windows), if use as IPC  
- host <String> - hostname or ip-address (optional, default 0.0.0.0), if use as TCP  
- port <Integer> - port (optional, default 10001), if use as TCP  
- logins <Object> - login - password pairs as `{login1:password1, login2:password2}`  
  
#### Create socket client    

```
Test.createClient(<Options>);
```
  
Options <Object> Required:  
  
- path <String> - name of the file socket (linux) or the name of the named channel (windows), if use as IPC  
- host <String> - hostname or ip-address (optional, default 0.0.0.0), if use as TCP  
- port <Integer> - port (optional, default 10001), if use as TCP  
- login <String> - login in socket  
- password <String> - password in socket  
  
#### Connection status   
return <Boolean> true if connected, false if disconnected  
  
```
Test.connected;
```

#### Connection role  
return <String> role:  

- master (if Master process in Cluster) 
- worker (if Worker process in Cluster)  
  
priority role:  
  
- server (if use createServer(<Object>))  
- client (if use createClient(<Object>))  
  
```
Test.role;
```

## Architectural schemes  


#### Basic Scheme  
  
![BasicScheme](https://github.com/siarheidudko/redux-cluster/raw/master/img/BasicScheme.png)  
  
#### Cluster Scheme   
You can use createServer (<Object>) in any process in cluster (and outside cluster process).   
Using createClient (<Object>) is logical in a Master process or a single process. In any case, if you create a createClient (<Onject>) in the Worker process, it will not work with the rest of the cluster processes, does not have access to them. So you will have to create createClient (<Onject>) in each Worker process that needs access to the Store.  
   
![ClusterScheme](https://github.com/siarheidudko/redux-cluster/raw/master/img/ClusterScheme.png)  
  
## LICENSE  
  
MIT  
