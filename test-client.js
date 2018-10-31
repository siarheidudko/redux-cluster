/**
 *	Redux-Cluster
 *	(c) 2018 by Siarhei Dudko.
 *
 *	Cluster module for redux synchronizes all redux store in cluster processes.
 *	LICENSE MIT
 */

"use strict"

var ReduxCluster = require('./index.js'),
	Cluster = require('cluster'),
	Lodash = require('lodash'),
	Colors = require('colors');
	
	
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
Test.createClient({path: "mysock.socks", login:"test",password:"12345"});
Test.subscribe(function(){
	if(Cluster.isMaster){
		var name = 'm';
	} else {
		var name = Cluster.worker.id;
	}
	console.log(Colors.gray('Store One | '+ name + ' | ' + JSON.stringify(Test.getState())));
});

if(Cluster.isMaster){
	for(var i=0; i < 3; i++){
		setTimeout(function(){Cluster.fork();}, i*20000)
	}
	Test.dispatch({type:'TASK', payload: {version:'RemoteMasterTest0'}});
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'RemoteMasterTest'+i}});
		i++;
	}, 5000);
} else {
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'RemoteWorkerTest'+i}});
		i++;
	}, 5000, i);
}