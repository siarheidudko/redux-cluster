/**
 *	Redux-Cluster Test
 *	(c) 2018 by Siarhei Dudko.
 *
 *	standart test (cluster IPC channel)
 *	LICENSE MIT
 */

"use strict"

var ReduxCluster = require('./index.js'),
	Cluster = require('cluster'),
	Lodash = require('lodash'),
	Colors = require('colors');
	
function editProcessStorage(state = {versions:[]}, action){ 
	try {
		switch (action.type){
			case 'TASK': 
				var state_new = Lodash.clone(state);
				if(state_new.versions.length > 500){
					state_new.versions.splice(0,100);
				}
				state_new.versions.push(action.payload.version);
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

function editProcessStorage2(state = {versions:[]}, action){
	try {
		switch (action.type){
			case 'UPDATE': 
				var state_new = Lodash.clone(state);
				state_new.versions = action.payload.versions;
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

	
var Test = ReduxCluster.createStore(editProcessStorage);
Test.mode = "action";
var Test2 = ReduxCluster.createStore(editProcessStorage2);

if(Cluster.isMaster){
	setTimeout(function(){Cluster.fork();}, i*20000)
	
	Test.dispatch({type:'TASK', payload: {version:'MasterTest0'}});
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'MasterTest'+i}});
		i++;
	}, 55);
	
} else {
	
	Test.dispatch({type:'TASK', payload: {version:'WorkerTest0'}});
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'WorkerTest'+i}});
		i++;
	}, 99, i);
	
	Test.subscribe(function(){
		Test2.dispatch({type:'UPDATE', payload: {versions:Test.getState().versions}});
	});
}

if(Cluster.isMaster){
	var ok = 0;
	var bad = 0;
	setInterval(function(){
		if(Lodash.isEqual(Test.getState().versions, Test2.getState().versions)){
			ok++;
			console.log(Colors.green("ok-"+ok+'|'+parseInt((ok*100/(ok+bad)), 10)+'%'));
		}else {
			bad++;
			console.log(Colors.red("bad-"+bad+'|'+parseInt((bad*100/(ok+bad)), 10)+'%'));
		}
	}, 1000);
}