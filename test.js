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
var Test2 = ReduxCluster.createStore(editProcessStorage2);
	
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
function editProcessStorage2(state = {test:''}, action){ 
	try {
		switch (action.type){
			case 'TASK':
				var state_new = Lodash.clone(state);
				state_new.test = action.payload.test;
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
	console.log(Colors.gray('Store One | '+ name + ' | ' + JSON.stringify(Test.getState())));
});
Test2.subscribe(function(){
	if(Cluster.isMaster){
		var name = 'm';
	} else {
		var name = Cluster.worker.id;
	}
	console.log(Colors.yellow('Store Two | '+ name + ' | ' + JSON.stringify(Test2.getState())));
});

if(Cluster.isMaster){
	for(var i=0; i < 3; i++){
		Cluster.fork();
	}
	Test.dispatch({type:'TASK', payload: {version:'MasterTest0'}});
	Test2.dispatch({type:'TASK', payload: {test:'Master0'}});
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'MasterTest10'}});
		Test2.dispatch({type:'TASK', payload: {test:'Master10'}});
	}, 10000);
} else {
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'WorkerTest'+i}});
		Test2.dispatch({type:'TASK', payload: {test:'Worker'+i}});
		i++;
	}, 1000, i);
}