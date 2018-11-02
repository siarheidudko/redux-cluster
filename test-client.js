/**
 *	Redux-Cluster Test
 *	(c) 2018 by Siarhei Dudko.
 *
 *	standart test, include test Socket IPC and TCP (remote) client 
 *	LICENSE MIT
 */

"use strict"

var ReduxCluster = require('./index.js'),
	Cluster = require('cluster'),
	Lodash = require('lodash');
	
	
var Test = ReduxCluster.createStore(editProcessStorage);
var Test2 = ReduxCluster.createStore(editProcessStorage2);

var testTwo =  false;

if(Cluster.isMaster){
	Test.createClient({path: "./mysock.socks", login:"test1", password:'12345'});
	if(testTwo)
		Test2.createClient({host: "localhost", port: 8888, login:"test2", password:'123456'});
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
function editProcessStorage2(state = {version:''}, action){ 
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

if(testTwo)
	Test2.subscribe(function(){
		if(Cluster.isMaster){
			var name = 'm';
		} else {
			var name = Cluster.worker.id;
		}
		console.log(' S2 | ' + name + ' | ' + JSON.stringify(Test2.getState()));
	});

if(Cluster.isMaster){
	for(var i=0; i < 2; i++){
		setTimeout(function(){Cluster.fork();}, i*10000);
	}
	Test.dispatch({type:'TASK', payload: {version:'OneRemoteMasterTest0'}});
	if(testTwo){
		Test2.dispatch({type:'TASK', payload: {version:'TwoRemoteMasterTest0'}});
	}
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'OneRemoteMasterTest'+i}});
		if(testTwo)
			Test2.dispatch({type:'TASK', payload: {version:'TwoRemoteMasterTest'+i}});
		i++;
	}, 11000);
} else {
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'OneRemoteWorkerTest'+i}});
		if(testTwo)
			Test2.dispatch({type:'TASK', payload: {version:'TwoRemoteWorkerTest'+i}});
		i++;
	}, 22000+(Cluster.worker.id*1500), i);
}
