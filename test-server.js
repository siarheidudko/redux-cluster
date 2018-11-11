/**
 *	Redux-Cluster Test
 *	(c) 2018 by Siarhei Dudko.
 *
 *	standart test, include test Socket IPC and TCP (remote) server 
 *	LICENSE MIT
 */

"use strict"

var ReduxCluster = require('./index.js'),
	Cluster = require('cluster'),
	Lodash = require('lodash');
	
	
var Test = ReduxCluster.createStore(editProcessStorage);
var Test2 = ReduxCluster.createStore(editProcessStorage2);

var testTwo =  true;

if(!Cluster.isMaster){
	Test.createServer({host: "0.0.0.0", port: 8888, logins:{test2:'123456'}});
} else {
	if(testTwo)
		Test2.createServer({path: "./mysock.sock", logins:{test1:'12345'}});
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
	for(var i=0; i < 1; i++){
		setTimeout(function(){Cluster.fork();}, i*10000);
	}
	Test.dispatch({type:'TASK', payload: {version:'OneMasterTest0'}});
	if(testTwo){
		Test2.dispatch({type:'TASK', payload: {version:'TwoMasterTest0'}});
	}
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'OneMasterTest'+i}});
		if(testTwo)
			Test2.dispatch({type:'TASK', payload: {version:'TwoMasterTest'+i}});
		i++;
	}, 19000);
} else {
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'OneWorkerTest'+i}});
		if(testTwo)
			Test2.dispatch({type:'TASK', payload: {version:'TwoWorkerTest'+i}});
		i++;
	}, 31000+(Cluster.worker.id*3600), i);
}
