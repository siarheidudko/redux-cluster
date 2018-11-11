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
	
	Test.createServer({host: "0.0.0.0", port: 8888, logins:{test2:'123456'}});
	Test2.createClient({host: "localhost", port: 8889, login:"test2", password:'123456'});
	
	setTimeout(function(){Cluster.fork();}, i*20000);
	
	Test.dispatch({type:'TASK', payload: {version:'MasterTest0'}});
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'MasterTest'+i}});
		i++;
	}, 500);
	
} else {
	
	Test.dispatch({type:'TASK', payload: {version:'WorkerTest0'}});
	var i = 0;
	setInterval(function(){
		Test.dispatch({type:'TASK', payload: {version:'WorkerTest'+i}});
		i++;
	}, 505, i);
}

if(!Cluster.isMaster){
	var ok = 0;
	var bad = 0;
	setInterval(function(){
		if(ok+bad < 500){	//строгий режим
			if(Lodash.isEqual(Test.getState().versions, Test2.getState().versions)){
				ok++;
				console.log(Colors.green("ok-"+ok+'|'+parseInt((ok*100/(ok+bad)), 10)+'%'));
			}else {
				bad++;
				console.log(Colors.red("bad-"+bad+'|'+parseInt((bad*100/(ok+bad)), 10)+'%'));
				console.log(Test.getState().versions.length+' | '+Test2.getState().versions.length)
				console.log(Test.getState().versions[Test.getState().versions.length-1]+' | '+ Test2.getState().versions[Test2.getState().versions.length-1] );
			}
		} else{	//не строгий режим
			if(Test.getState().versions.length === Test2.getState().versions.length){
				ok++;
				console.log(Colors.green("ok-"+ok+'|'+parseInt((ok*100/(ok+bad)), 10)+'%'));
			}else {
				bad++;
				console.log(Colors.red("bad-"+bad+'|'+parseInt((bad*100/(ok+bad)), 10)+'%'));
				console.log(Test.getState().versions.length+' | '+Test2.getState().versions.length)
				console.log(Test.getState().versions[Test.getState().versions.length-1]+' | '+ Test2.getState().versions[Test2.getState().versions.length-1] );
			}
		}
	}, 500);
}