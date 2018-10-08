/**
 *	Redux-Cluster
 *	(c) 2018 by Siarhei Dudko.
 *
 *	Cluster module for redux synchronizes all redux store in cluster processes.
 *	LICENSE MIT
 */

"use strict"

var Redux = require('redux'),
	Cluster = require('cluster'),
	Lodash = require('lodash'),
	Crypto = require('crypto');
	
var ReduxClusterModule = {};
Object.assign(ReduxClusterModule, Redux);
	
function hasher(data){
	const hash = Crypto.createHash('sha1');
	hash.update(data);
	return(hash.digest('hex'));
}
	
function editWorkerStorage(state = {}, action){ 
	if (action.type === 'REDUX_CLUSTER_SYNC'){
		var state_new = Lodash.clone(action.payload);
		return state_new;
	} else {
		var state_new = Lodash.clone(state);
	}
	return state_new;
}

function ReduxCluster(_reducer){
	var self = this;
	var hash = hasher(_reducer.toString());
	if(Cluster.isMaster){
		Object.assign(self, Redux.createStore(_reducer));
		function SendToAll(){
			for (const id in Cluster.workers) {
				Cluster.workers[id].send({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:hash, _state:self.getState()}); 
			}
		}
		self.subscribe(function(){
			SendToAll();
		});
		Cluster.on('message', (worker, message, handle) => {
			if (arguments.length === 2) {
				handle = message;
				message = worker;
				worker = undefined;
			}
			if((message._msg === 'REDUX_CLUSTER_MSGTOMASTER') && (message._hash === hash)){
				if(message._action.type === 'REDUX_CLUSTER_SYNC')
					throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
				self.dispatch(message._action);
			} else if((message._msg === 'REDUX_CLUSTER_START') && (message._hash === hash)){
				SendToAll();
			};
		});
	} else {
		Object.assign(self, Redux.createStore(editWorkerStorage));
		self.dispatchNEW = self.dispatch;
		self.dispatch = function(_data){ 
			process.send({_msg:'REDUX_CLUSTER_MSGTOMASTER', _hash:hash, _action:_data});
		};
		process.on("message", function(data){
			if((data._msg === "REDUX_CLUSTER_MSGTOWORKER") && (data._hash === hash)){
				self.dispatchNEW({type:"REDUX_CLUSTER_SYNC", _hash:hash, payload:data._state});
			}
		});
		process.send({_msg:'REDUX_CLUSTER_START', _hash:hash});
	}
}

function createStore(_reducer){
	return new ReduxCluster(_reducer);
}
ReduxClusterModule.createStore = createStore;

module.exports = ReduxClusterModule;
	
	
	