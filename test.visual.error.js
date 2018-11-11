/**
 *	Redux-Cluster Test
 *	(c) 2018 by Siarhei Dudko.
 *
 *	test error
 *	LICENSE MIT
 */

"use strict"

var ReduxCluster = require('./index.js'),
	Cluster = require('cluster'),
	Lodash = require('lodash');
	
	
var Test = ReduxCluster.createStore(editProcessStorage);

try{
	if(Cluster.isMaster)
		var Test2 = ReduxCluster.createStore(editProcessStorage);
} catch(err){
	console.error(err.message);
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

Test.dispatch({type:"REDUX_CLUSTER_SYNC", payload:{test:1}});
	
if(Cluster.isMaster)
	Cluster.fork();