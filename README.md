
# Redux-Cluster  
Synchronize your redux storage in a cluster. 


[![npm](https://img.shields.io/npm/v/redux-cluster.svg)](https://www.npmjs.com/package/redux-cluster)
[![npm](https://img.shields.io/npm/dy/redux-cluster.svg)](https://www.npmjs.com/package/redux-cluster)
[![NpmLicense](https://img.shields.io/npm/l/redux-cluster.svg)](https://www.npmjs.com/package/redux-cluster)
![GitHub last commit](https://img.shields.io/github/last-commit/siarheidudko/redux-cluster.svg)
![GitHub release](https://img.shields.io/github/release/siarheidudko/redux-cluster.svg)
  
- Supports native methods of redux.  
- Uses IPC only (in Basic Scheme) or IPC and Socket (in Cluster Scheme).  
- Store are isolated and identified by means of hashes.  
  

## Install  
  
```
	npm i redux-cluster --save
```
  

## Use  
[Подробное описание RU](https://sergdudko.tk/2018/11/14/redux-cluster-%D0%BF%D1%80%D0%BE%D0%B4%D0%BE%D0%BB%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B8%D0%BB%D0%B8-%D1%81%D0%B8%D0%BD%D1%85%D1%80%D0%BE%D0%BD%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F-%D0%BF%D0%B0%D0%BC/ "Подробное описание RU")   
  

### Connection library  
    
```
	var ReduxCluster = require('redux-cluster');
```
  

### Create store  
    
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
  

### Subscribe updates  
   
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
  

### Dispatch event  
  
```
	Test.dispatch({type:'TASK', payload: {version:'1111111'}})
```
  

### Error output callback  
Default is console.error  
  
```
	Test.stderr = function(err){console.error(err);}
```     
  

### Synchronization mode  
This mode is enabled for the basic scheme as well.   
Set the type of synchronization, the default `action`. 
   
- action - send a action of the store status for each action and send a snapshot every 1000 (default, Test.resync) action  
- snapshot -  send a snapshot of the store status for each action  
   
```
Test.mode = "action";
``` 
  

### Snapshot synchronization frequency (for action mode)  
Number of actions before a snapshot of guaranteed synchronization will be sent. Default 1000 actions.  
  
```
Test.resync = 1000;
```  
  

### Create socket server  
Please familiarize yourself with the architectural schemes before use. In Windows createServer is not supported in child process (named channel write is not supported in the child process), please use as TCP-server.  
  
```
Test.createServer(<Options>);
```
  
##### Example  
  
```
var Test = ReduxCluster.createStore(reducer);
Test.createServer({path: "./mysock.sock", logins:{test1:'12345'}});
var Test2 = ReduxCluster.createStore(reducer2);
Test2.createServer({host: "0.0.0.0", port: 8888, logins:{test2:'123456'}});
```
   
Options <Object> Required:  
  
- path <String> - name of the file socket (linux) or the name of the named channel (windows), if use as IPC  
- host <String> - hostname or ip-address (optional, default 0.0.0.0), if use as TCP  
- port <Integer> - port (optional, default 10001), if use as TCP  
- logins <Object> - login - password pairs as `{login1:password1, login2:password2}`.  
  

### Create socket client    

```
Test.createClient(<Options>);
```
  
##### Example  
  
```
var Test = ReduxCluster.createStore(reducer);
Test.createClient({path: "./mysock.sock", login:"test1", password:'12345'});
var Test2 = ReduxCluster.createStore(reducer2);
Test2.createClient({host: "localhost", port: 8888, login:"test2", password:'123456'});
```
  
Options <Object> Required:  
  
- path <String> - name of the file socket (linux, file will be overwritten!) or the name of the named channel (windows), if use as IPC  
- host <String> - hostname or ip-address (optional, default 0.0.0.0), if use as TCP  
- port <Integer> - port (optional, default 10001), if use as TCP  
- login <String> - login in socket  
- password <String> - password in socket  
  

### Connection status   
return <Boolean> true if connected, false if disconnected  
  
```
Test.connected;
```
  

### Connection role  
return <Array> role:  

- master (if Master process in Cluster, sends and listen action to Worker) 
- worker (if Worker process in Cluster, processes and sends action to Master)   
- server (if use `createServer(<Object>)`, sends and listen action to Client)  
- client (if use `createClient(<Object>)`, processes and sends action to Server)  
  
```
Test.role;
```
  

### Want to use a web socket? Connect the redux-cluster-ws library  
  
#### Install  
  
```
	npm i redux-cluster-ws --save
```
  

#### Add websocket server wrapper and use  
  
```
require('redux-cluster-ws').server(Test);
Test.createWSServer(<Options>);
```
  
##### Example  
  
```
require('redux-cluster-ws').server(Test);
Test.createWSServer({
	host: "0.0.0.0", 
	port: 8888, 
	logins:{
		test2:'123456'
	}, 
	ssl:{
		key: /path/to/certificate-key,
		crt: /path/to/certificate,
		ca:	/path/to/certificate-ca
	}
});

require('redux-cluster-ws').server(Test2);
Test2.createWSServer({
	host: "localhost", 
	port: 8889, 
	logins:{
		test2:'123456'
	}
});
```
   
Options <Object> Required:  
  
- host <String> - hostname or ip-address
- port <Integer> - port (optional, default 10002) 
- logins <Object> - login - password pairs as `{login1:password1, login2:password2}`. 
- ssl <Object> - path to server certificate (if use as https, default use http). 
  
#### Add websocket client library  
Client does not use internal Node libraries for webpack compatibility. Therefore, on the client, you must create a store with the same reducer.  

```
//create Redux Store
var ReduxClusterWS = require('redux-cluster-ws').client;
var Test = ReduxClusterWS.createStore(<Reducer>);

//connect to Redux-Cluster server (use socket.io)
Test.createWSClient(<Options>);
```
  
##### Example  
  
```
var Test = ReduxCluster.createStore(reducer);
Test.createWSClient({host: "https://localhost", port: 8888, login:"test2", password:'123456'});
```
  
Options <Object> Required:  
  
- host <String> - hostname or ip-address (protocol include)  
- port <Integer> - port (optional, default 10002)  
- login <String> - login in websocket  
- password <String> - password in websocket  
  

### Save storage to disk and boot at startup  
Save storage to disk and boot at startup. It is recommended to perform these actions only in the primary server / master, since they create a load on the file system.  
Attention! For Worker and Master, you must specify different paths. Return Promise object. 
```
  Test.backup(<Object>);
```
  
##### Example  
  
```
Test.backup({
	path:'./test.backup', 
	key:"password-for-encrypter", 
	count:1000
}).catch(function(err){
	... you handler
});
```
   
Options <Object> Required:  
- path <String> - file system path for backup (Attention! File will be overwritten!)  
- key <String> - encryption key (can be omitted)  
- timeout <Integer> - backup timeout (time in seconds for which data can be lost), if count is omitted.  
- count <Integer> - amount of action you can lose  
  

## Architectural schemes  

#### Basic Scheme  
  
![BasicScheme](https://github.com/siarheidudko/redux-cluster/raw/master/img/BasicScheme.png)  
  
#### Cluster Scheme   
You can use `createServer(<Object>)` in any process in cluster (and outside cluster process).   
Using `createClient(<Object>)` is logical in a Master process or a single process. In any case, if you create a `createClient(<Object>)` in the Worker process, it will not work with the rest of the cluster processes, does not have access to them. So you will have to create `createClient(<Object>)` in each Worker process that needs access to the Store.  
   
![ClusterScheme](https://github.com/siarheidudko/redux-cluster/raw/master/img/ClusterScheme.png)  
  
##### Server Scheme in Socket   
  
![ServerSocketScheme](https://github.com/siarheidudko/redux-cluster/raw/master/img/ServerSocketScheme.png)  
  
##### Client (Cluster) Scheme in Socket   
  
![ClientSocketScheme](https://github.com/siarheidudko/redux-cluster/raw/master/img/ClientSocketScheme.png)  
  
##### Client (Worker) Scheme in Socket   
This is a bad way, it will lead to breaks in the interaction of the ReduxCluster with the Master process.  
  
![ClientSocketScheme2](https://github.com/siarheidudko/redux-cluster/raw/master/img/ClientSocketScheme2.png)  
  
##### Client (Single Process) Scheme in Socket   
  
![ClientSocketScheme3](https://github.com/siarheidudko/redux-cluster/raw/master/img/ClientSocketScheme3.png)  
  
## Example 
  
#### Basic Scheme  
  
```
var ReduxCluster = require('redux-cluster'),
	Cluster = require('cluster'),
	Lodash = require('lodash');
	
var Test = ReduxCluster.createStore(editProcessStorage);
	
function editProcessStorage(state = {version:''}, action){ 
	try {
		switch (action.type){
			case 'TASK':
				var state_new = Lodash.clone(state);
				state_new.version = action.payload.version;
				return state_new;
				break;
			default:
				break;
		}
	} catch(e){
	}
	var state_new = Lodash.clone(state);
	return state_new;
}

Test.subscribe(function(){
	if(Cluster.isMaster){
		var name = 'm';
	} else {
		var name = Cluster.worker.id;
	}
	console.log(name + ' | ' + JSON.stringify(Test.getState()));
});

if(Cluster.isMaster){
	for(var i=0; i < 3; i++){
		setTimeout(function(){Cluster.fork();}, i*10000)
	}
	Test.dispatch({type:'TASK', payload: {version:'MasterTest'}});
} else {
	Test.dispatch({type:'TASK', payload: {version:'WorkerTest'+Cluster.worker.id}});
}
```
  
#### Cluster Scheme Server
  
```
var ReduxCluster = require('redux-cluster'),
	Cluster = require('cluster'),
	Lodash = require('lodash');
	
var Test = ReduxCluster.createStore(editProcessStorage);

if(Cluster.isMaster){
	Test.createServer({path: "./mysock.sock", logins:{test1:'12345'}});
}
	
function editProcessStorage(state = {version:''}, action){ 
	try {
		switch (action.type){
			case 'TASK':
				var state_new = Lodash.clone(state);
				state_new.version = action.payload.version;
				return state_new;
				break;
			default:
				break;
		}
	} catch(e){
	}
	var state_new = Lodash.clone(state);
	return state_new;
}

Test.subscribe(function(){
	if(Cluster.isMaster){
		var name = 'm';
	} else {
		var name = Cluster.worker.id;
	}
	console.log(' S1 | ' + name + ' | ' + JSON.stringify(Test.getState()));
});

if(Cluster.isMaster){
	for(var i=0; i < 1; i++){
		setTimeout(function(){Cluster.fork();}, i*10000);
	}
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'MasterTest'+i}});
		i++;
	}, 19000);
} else {
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'WorkerTest'+i}});
		i++;
	}, 31000+(Cluster.worker.id*3600), i);
}
```
  
#### Cluster Scheme Client
  
```
var ReduxCluster = require('redux-cluster'),
	Cluster = require('cluster'),
	Lodash = require('lodash');
	
var Test = ReduxCluster.createStore(editProcessStorage);

if(Cluster.isMaster){
	Test.createClient({path: "./mysock.sock", login:"test1", password:'12345'});
}
	
function editProcessStorage(state = {version:''}, action){ 
	try {
		switch (action.type){
			case 'TASK':
				var state_new = Lodash.clone(state);
				state_new.version = action.payload.version;
				return state_new;
				break;
			default:
				break;
		}
	} catch(e){
	}
	var state_new = Lodash.clone(state);
	return state_new;
}

Test.subscribe(function(){
	if(Cluster.isMaster){
		var name = 'm';
	} else {
		var name = Cluster.worker.id;
	}
	console.log(name + ' | ' + JSON.stringify(Test.getState()));
});

if(Cluster.isMaster){
	for(var i=0; i < 2; i++){
		setTimeout(function(){Cluster.fork();}, i*8000);
	}
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'OneRemoteMasterTest'+i}});
		i++;
	}, 11000);
} else {
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'OneRemoteWorkerTest'+i}});
		i++;
	}, 22000+(Cluster.worker.id*1500), i);
}
```
  
## LICENSE  
  
MIT  
