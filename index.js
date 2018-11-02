/**
 *	Redux-Cluster
 *	(c) 2018 by Siarhei Dudko.
 *
 *	Cluster (default IPC cluster channel) module for redux synchronizes all redux store in cluster processes (v.1.0.x).
 *	Cluster (default IPC cluster channel) and Socket (custom IPC or TCP channel) for redux synchronizes all redux store (v.1.1.x).
 *	LICENSE MIT
 */

"use strict"

var Redux = require('redux'),
	Cluster = require('cluster'),
	Lodash = require('lodash'),
	Crypto = require('crypto'),
	Net = require('net'),
	Path = require('path'),
	Os = require('os');
	
var ReduxClusterModule = {};	//модуль
Object.assign(ReduxClusterModule, Redux);	//копирую свойства Redux
var reducers = {}; //список редьюсеров (хэш собирается по имени редьюсера для совместимости различных ОС, т.к. hasher(<function>.toString()) для разных ос дает разные суммы)

//эмулирую performance.now()
var hrtimeproc = process.hrtime();
var performance = {now:function(){
	try{
		const now = parseFloat(process.hrtime(hrtimeproc).toString().replace(/[,]/g,"."));
		return now;
	} catch(err){
		return undefined;
	}
}};
	
function hasher(data){	//хэширование редьюсера
	if(typeof(data) === 'string'){
		const hash = Crypto.createHash('sha1');
		hash.update(data);
		return(hash.digest('hex'));
	} else 
		return;
}
	
function editWorkerStorage(state = {}, action){ 	//редьюсер для воркеров
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
	self.connected = false;
	self.RCHash = hasher(_reducer.name);	//создаю метку текущего редьюсера для каждого экземпляра
	if(typeof(reducers[_reducer.name]) === 'undefined'){
		reducers[_reducer.name] = self.RCHash;
	} else {
		throw new Error("Please don't use a reducer with the same name!");
	}
	self.sendtoall = function(_message){	//отправка снимков во все воркеры
		if(Cluster.isMaster){
			if(typeof(_message) ==='object'){
				for (const id in Cluster.workers) {
					Cluster.workers[id].send(_message); 
				}
			} else{
				for (const id in Cluster.workers) {
					Cluster.workers[id].send({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.RCHash, _state:self.getState()}); 
				}
			}
		}
	}
	if(Cluster.isMaster){ //мастер
		self.role = "master";
		Object.assign(self, Redux.createStore(_reducer));	//создаю хранилище с оригинальным редьюсером
		self.unsubscribe = self.subscribe(function(){	//подписываю отправку снимков при изменении
			self.sendtoall();
		});
		Cluster.on('message', (worker, message, handle) => {	//получение сообщения мастером
			if (arguments.length === 2) {	//поддержка старой версии (без идентификатора воркера)
				handle = message;
				message = worker;
				worker = undefined;
			}
			if(message._hash === self.RCHash){
				switch(message._msg){
					case 'REDUX_CLUSTER_MSGTOMASTER':	//получаю диспатчер от воркера
						if(message._action.type === 'REDUX_CLUSTER_SYNC')
							throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
						self.dispatch(message._action);
						break;
					case 'REDUX_CLUSTER_START':	//получаю метку, что воркер запущен
						if(worker){
							Cluster.workers[worker.id].send({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.RCHash, _state:self.getState()});	//в зависимости от наличия метки воркера, отправляю снимок ему, либо всем
						} else {
							self.sendtoall();
						}
						break;
				}
			}
		});
		self.connected = true;
	} else {	//воркер
		self.role = "worker";
		Object.assign(self, Redux.createStore(editWorkerStorage));	//создаю хранилище с собственным редьюсером
		self.dispatchNEW = self.dispatch;	//переопределяю диспатчер
		self.dispatch = function(_data){ 
			process.send({_msg:'REDUX_CLUSTER_MSGTOMASTER', _hash:self.RCHash, _action:_data});	//вместо оригинального диспатчера подкладываю IPC
		};
		process.on("message", function(data){	//получение сообщения воркером
			if((data._hash === self.RCHash) && (self.role !== 'client')){	//если роль изменена на client больше не слушаем default IPC
				switch(data._msg){
					case 'REDUX_CLUSTER_MSGTOWORKER':	//получение снимка от мастера
						self.dispatchNEW({type:"REDUX_CLUSTER_SYNC", _hash:self.RCHash, payload:data._state});	//запускаю диспатчер Redux
						break;
					case 'REDUX_CLUSTER_CONNSTATUS':
						self.connected = data._connected;
						break;
				}
			}
		});
		self.connected = true;
		process.send({_msg:'REDUX_CLUSTER_START', _hash:self.RCHash});	//запрашиваю у мастера снимок хранилища
	}
}

function createStore(_reducer){		//функция создания хранилища
	var _ReduxCluster = new ReduxCluster(_reducer);		//создаю экземпляр хранилища
	_ReduxCluster.createServer = function(_settings){	//подключаю объект создания сервера
		_ReduxCluster.role = "server";
		_ReduxCluster.connected = false;
		return new createServer(_ReduxCluster, _settings);
	}
	_ReduxCluster.createClient = function(_settings){	//подключаю объект создания клиента
		_ReduxCluster.role = "client";
		_ReduxCluster.connected = false;
		if(Cluster.isMaster){
			_ReduxCluster.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_ReduxCluster.RCHash, _connected:false});
			_ReduxCluster.unsubscribe(); //отменяю подписку от предыдущего объекта
			Object.assign(_ReduxCluster, Redux.createStore(editWorkerStorage));		//пересоздаю экземпляр хранилища для мастера (с собственным редьюсером)
			_ReduxCluster.unsubscribe = _ReduxCluster.subscribe(function(){ //подписываюсь на текущий (новый) объект
				_ReduxCluster.sendtoall();
			});
		}
		return new createClient(_ReduxCluster, _settings);
	}
	return _ReduxCluster;
}

function createServer(_store, _settings){	//объект создания сервера
	var self = this;
	self.store = _store;
	self.sockets = {};
	self.database = {};
	self.listen = {port:10001};	//дефолтные настройки
	if(typeof(_settings) === 'object'){	//переопределяю конфиг
		if(typeof(_settings.path) === 'string'){
			switch(Os.platform ()){
				case 'win32':
					self.listen = {path:Path.join('\\\\?\\pipe', _settings.path)};
					break;
				default:
					self.listen = {path:Path.join(_settings.path)};
					break;
			}
		} else{
			if(typeof(_settings.host) === 'string')
				self.listen.host = _settings.host;
			if(typeof(_settings.port) === 'number')
				self.listen.port = _settings.port;
		}
		if(typeof(_settings.logins) === 'object')
			for(const login in _settings.logins){ self.database[hasher("REDUX_CLUSTER"+login)] = hasher("REDUX_CLUSTER"+_settings.logins[login]); }
	}
	self.unsubscribe = self.store.subscribe(function(){	//подписываю сокет на изменения Redux
		for(const uid in self.sockets){
			self.sockets[uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.store.RCHash, _state:self.store.getState()});
		}
	});
	self.server = Net.createServer((socket) => {
		var _uid = generateUID();
		socket.uid = _uid;
		socket.writeNEW = socket.write;	//переопределяю write (объектный режим)
		socket.write = function(_data){
			try{
				return socket.writeNEW(Buffer.from(JSON.stringify(_data)));
			} catch(err){
				console.error('ReduxCluster.createServer write error: '+err.message);
				return;
			}
		}
		socket.on('data', (buffer) => {	//получение сообщений в сокет
			var data = jsonParser(buffer);
			for(var iter = 0; iter < data.length; iter++){
				if(data[iter]._hash === self.store.RCHash){	//проверяю что сообщение привязано к текущему хранилищу
					switch(data[iter]._msg){
						case 'REDUX_CLUSTER_MSGTOMASTER': 	//получаю диспатчер от клиента
							if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
								if(data[iter]._action.type === 'REDUX_CLUSTER_SYNC')
									throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
								self.store.dispatch(data[iter]._action);
							}
							break;
						case 'REDUX_CLUSTER_START':	//получаю метку, что клиент запущен
							if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
								self.sockets[socket.uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.store.RCHash, _state:self.store.getState()});
							}
							break;
						case 'REDUX_CLUSTER_SOCKET_AUTH':
							if( (typeof(data[iter]._login) !== 'undefined') && 
							    (typeof(data[iter]._password) !== 'undefined') &&
							    (typeof(self.database[data[iter]._login]) !== 'undefined') && 
							    (self.database[data[iter]._login] === data[iter]._password)){
								   self.sockets[socket.uid] = socket;
								   socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:self.store.RCHash, _value:true});
							    } else {
									socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:self.store.RCHash, _value:false});
									if(typeof(socket.end) === 'function'){
										socket.end();
									}
									if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
										delete self.sockets[socket.uid];
									}
							    }
							break;
					}
				}
			}
		});
		socket.on('error', function(err){ //обработка ошибок сокета
			console.error('ReduxCluster.createServer client error: '+err.message);
			if(typeof(socket.end) === 'function'){
				socket.end();
			}
			if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
				delete self.sockets[socket.uid];
			}
		});
	}).on('listening', function(){	//сервер слушает
		_store.connected = true;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:true});
	}).on('close', function(){	//все коннекты уничтожены
		_store.connected = false;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:false});
		self.unsubscribe();
		setTimeout(createServer, 10000, _store, _settings);
	}).on('error', function(err){ //обработка ошибок сервера
		console.error('ReduxCluster.createServer socket error: '+err.message);
		if(typeof(self.server.close) === 'function')
			self.server.close()
	});
	self.server.listen(self.listen);
}

function createClient(_store, _settings){	//объект создания клиента
	var self = this;
	self.store = _store;
	self.listen = {port:10001};	//дефолтные настройки
	if(typeof(_settings) === 'object'){	//переопределяю конфиг
		if(typeof(_settings.path) === 'string'){
			switch(Os.platform ()){
				case 'win32':
					self.listen = {path:Path.join('\\\\?\\pipe', _settings.path)};
					break;
				default:
					self.listen = {path:Path.join(_settings.path)};
					break;
			}
		} else{
			if(typeof(_settings.host) === 'string')
				self.listen.host = _settings.host;
			if(typeof(_settings.port) === 'number')
				self.listen.port = _settings.port;
		}
		if(typeof(_settings.login) === 'string')
			self.login = hasher("REDUX_CLUSTER"+_settings.login);
		if(typeof(_settings.password) === 'string')
			self.password = hasher("REDUX_CLUSTER"+_settings.password);
	}
	self.client = new Net.createConnection(self.listen);
	self.client.on('connect', function(){
		_store.connected = true;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:true});
		self.client.writeNEW = self.client.write;	//переопределяю write (объектный режим)
		self.client.write = function(_data){
			try {
				return self.client.writeNEW(Buffer.from(JSON.stringify(_data)));
			} catch(err){
				console.error('ReduxCluster.createClient write error: '+err.message);
				return;
			}
		}
		if(typeof(self.store.dispatchNEW) !== 'function'){	//переопределяю dispatch для мастера
			self.store.dispatchNEW = self.store.dispatch;
		}
		self.store.dispatch = function(_data){
			self.client.write({_msg:'REDUX_CLUSTER_MSGTOMASTER', _hash:self.store.RCHash, _action:_data});
		}
		self.client.write({_msg:'REDUX_CLUSTER_SOCKET_AUTH', _hash:self.store.RCHash, _login:self.login, _password:self.password});	//авторизация в сокете
	}).on('close', function(){
		_store.connected = false;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:false});
		setTimeout(createClient, 250, _store, _settings);
	}).on('error', function(err){ //обработка ошибок клиента
		console.error('ReduxCluster.createClient client error: '+err.message);
	}).on('data', (buffer) => {	//при получении сообщения обновляю redux
		if(!self.client.destroyed){
			var data = jsonParser(buffer);
			for(var iter = 0; iter < data.length; iter++){
				if(data[iter]._hash === self.store.RCHash){
					switch(data[iter]._msg){
						case 'REDUX_CLUSTER_MSGTOWORKER':
							self.store.dispatchNEW({type:"REDUX_CLUSTER_SYNC", _hash:self.store.RCHash, payload:data[iter]._state});
							break;
						case 'REDUX_CLUSTER_SOCKET_AUTHSTATE':
							if(data[iter]._value === true){
								self.client.write({_msg:'REDUX_CLUSTER_START', _hash:self.store.RCHash});	//синхронизирую хранилище
							}else{
								self.client.destroy('authorization failed');
							}
							break;
					}
				}
			}
		}
	});
}

//парсинг json
function jsonParser(data){
	var _data = data.toString();
	var _objArr = [];
	var _tempArr = _data.split('}{');
	if(_tempArr.length > 1){	//исправляем json на валидный, после split (для одного элемента json не изменялся)
		for(var i = 0; i < _tempArr.length; i++){
			switch(i){
				case 0:
					_tempArr[i] = _tempArr[i]+'}';
					break;
				case (_tempArr.length-1):
					_tempArr[i] = '{'+_tempArr[i];
					break;
				default:
					_tempArr[i] = '{'+_tempArr[i]+'}';
					break;
			}
		}
	}
	for(var i = 0; i < _tempArr.length; i++){
		try{
			_objArr.push(JSON.parse(_tempArr[i]));
		} catch(err){
			console.error('ReduxCluster jsonParser error: '+err.message);
		}
	}
	return _objArr;
}

//генерация uid
function generateUID() { 
	var d = new Date().getTime();
	if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
		d += performance.now(); 
	}
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		var r = (d + Math.random() * 16) % 16 | 0;
		d = Math.floor(d / 16);
		return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
	});
}

ReduxClusterModule.createStore = createStore; 	//переопределяю функцию создания хранилища

module.exports = ReduxClusterModule;
	
	
	