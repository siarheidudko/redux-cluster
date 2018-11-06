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


/*
Типы сообщений:

МастерВВоркер:
СтатусСоединения{									//отправка статуса соединения с сервером в воркеры
	_msg:"REDUX_CLUSTER_CONNSTATUS",				//тип сообщения (обязательно)
	_hash:_store.RCHash, 							//хэш названия редьюсера (обязательно для идентификации нужного стора)
	_connected:true									//статус соединения с сервером
}
Диспатчер{											//отправка экшена клиенту
	_msg:"REDUX_CLUSTER_MSGTOWORKER", 
	_hash:self.store.RCHash, 
	_action:{										//диспатчер (обязательно)
		type:"REDUX_CLUSTER_SYNC", 
		payload:self.store.getState()
	}
}

СерверВСокет:
Авторизация{										//ответ на запрос авторизации в сокете
	_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", 
	_hash:self.store.RCHash, 
	_value:false, 									//статус авторизации (обязательно)
	_banned: true									//IP заблокирован (не обязательно)
}
Диспатчер{											//отправка экшена клиенту
	_msg:"REDUX_CLUSTER_MSGTOWORKER", 
	_hash:self.store.RCHash, 
	_action:{										//диспатчер (обязательно)
		type:"REDUX_CLUSTER_SYNC", 
		payload:self.store.getState()
	}
}

КлиентВСокет:
Авторизация{										//запрос авторизации в сокете
	_msg:'REDUX_CLUSTER_SOCKET_AUTH', 
	_hash:self.store.RCHash, 
	_login:self.login, 								//логин для авторизации в сокете
	_password:self.password							//пароль для авторизации в сокете
}
Диспатчер{											//отправка экшена серверу
	_msg:'REDUX_CLUSTER_MSGTOMASTER', 
	_hash:self.store.RCHash, 
	_action:_data									//экшн для передачи в редьюсер сервера
}
Старт{												//отправка запроса на получения снимка хранилища
	_msg:'REDUX_CLUSTER_START', 
	_hash:self.store.RCHash
}

*/

function ReduxCluster(_reducer){
	var self = this;
	self.role = [];
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
					Cluster.workers[id].send({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:self.getState()}}); 
				}
			}
		}
	}
	self.altReducer = _reducer;	//оригинальный редьюсер
	try{
		var _d = self.altReducer();	//получаю значение state при старте
		if(typeof(_d) === 'object'){
			self.defaulstate = _d;
		} else {
			throw new Error('The returned value is not an object.');
		}
	} catch(e){
		self.defaulstate = {};
	};
	self.newReducer = function(state=self.defaulstate, action){	//собственный редьюсер
		if (action.type === 'REDUX_CLUSTER_SYNC'){
			var state_new = Lodash.clone(action.payload);
			return state_new;
		} else { 
			return self.altReducer(state, action);
		}
	}
	if(Cluster.isMaster){ //мастер
		if(self.role.indexOf("master") === -1) { self.role.push("master"); }
		Object.assign(self, Redux.createStore(self.newReducer));	//создаю хранилище с оригинальным редьюсером
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
							Cluster.workers[worker.id].send({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:self.getState()}});	//в зависимости от наличия метки воркера, отправляю снимок ему, либо всем
						} else {
							self.sendtoall();
						}
						break;
				}
			}
		});
		self.connected = true;
	} else {	//воркер
		if(self.role.indexOf("worker") === -1) { self.role.push("worker"); }
		Object.assign(self, Redux.createStore(self.newReducer));	//создаю хранилище с собственным редьюсером
		self.dispatchNEW = self.dispatch;	//переопределяю диспатчер
		self.dispatch = function(_data){ 
			process.send({_msg:'REDUX_CLUSTER_MSGTOMASTER', _hash:self.RCHash, _action:_data});	//вместо оригинального диспатчера подкладываю IPC
		};
		process.on("message", function(data){	//получение сообщения воркером
			if((data._hash === self.RCHash) && (self.role.indexOf("worker") !== -1)){	//если роль worker не активна больше не слушаем default IPC
				switch(data._msg){
					case 'REDUX_CLUSTER_MSGTOWORKER':	//получение снимка от мастера
						self.dispatchNEW(data._action);	//запускаю диспатчер Redux
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
		if((!Cluster.isMaster) && (typeof(_settings.path) === 'string') && (Os.platform() === 'win32')){	//IPC в дочернем процессе кластера не работает в windows
			throw new Error("Named channel is not supported in the child process, please use TCP-server");
		}
		if(_ReduxCluster.role.indexOf("server") === -1) { _ReduxCluster.role.push("server"); }
		_ReduxCluster.connected = false;
		return new createServer(_ReduxCluster, _settings);
	}
	_ReduxCluster.createClient = function(_settings){	//подключаю объект создания клиента
		if(_ReduxCluster.role.indexOf("client") === -1) { _ReduxCluster.role.push("client"); }
		if(_ReduxCluster.role.indexOf("worker") !== -1) { _ReduxCluster.role.splice(_ReduxCluster.role.indexOf("worker"), 1); } //удаляю роль воркера, т.к. IPC Master->Worker уничтожена (не обрабатывается)
		_ReduxCluster.connected = false;
		return new createClient(_ReduxCluster, _settings);
	}
	return _ReduxCluster;
}

function createServer(_store, _settings){	//объект создания сервера
	var self = this;
	self.store = _store;
	self.sockets = {};
	self.database = {};
	self.ip2ban = {};
	self.ip2banTimeout = 10800000;
	self.ip2banGCStart = setInterval(function(){
		for(const key in self.ip2ban){
			if((self.ip2ban[key].time+self.ip2banTimeout) < Date.now()){
				delete self.ip2ban[key];
			}
		}
	}, 60000);
	self.ip2banGCStop = function(){ clearInterval(self.ip2banGCStart); }
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
			self.sockets[uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.store.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:self.store.getState()}});
		}
	});
	self.server = Net.createServer((socket) => {
		var _i2bTest = replacer(socket.remoteAddress, true);
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
		socket.on('error', function(err){ //обработка ошибок сокета
			console.error('ReduxCluster.createServer client error: '+err.message);
			if(typeof(socket.end) === 'function'){
				socket.end();
			}
			if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
				delete self.sockets[socket.uid];
			}
		});
		if((typeof(_i2bTest) === 'undefined') || (typeof(self.ip2ban[_i2bTest]) === 'undefined') || ((typeof(self.ip2ban[_i2bTest]) === 'object') && ((self.ip2ban[_i2bTest].count < 5) || ((self.ip2ban[_i2bTest].time+self.ip2banTimeout) < Date.now())))){
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
									self.sockets[socket.uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.store.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:self.store.getState()}});
								}
								break;
							case 'REDUX_CLUSTER_SOCKET_AUTH':
								if( (typeof(data[iter]._login) !== 'undefined') && 
									(typeof(data[iter]._password) !== 'undefined') &&
									(typeof(self.database[data[iter]._login]) !== 'undefined') && 
									(self.database[data[iter]._login] === data[iter]._password)){
									   self.sockets[socket.uid] = socket;
									   if((typeof(_i2bTest) === 'string') && (typeof(self.ip2ban[_i2bTest]) === 'object')) { delete self.ip2ban[_i2bTest]; } //если логин присутствует в таблице забаненных удаляю
									   socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:self.store.RCHash, _value:true});
									} else {
										if(typeof(_i2bTest) === 'string') { 
											var _tempCount = 0;
											if(typeof(self.ip2ban[_i2bTest]) === 'object'){ 
												_tempCount = self.ip2ban[_i2bTest].count; 
												if(_tempCount >= 5) { _tempCount = 0; } //по таймауту сбрасываю счетчик попыток
											}
											self.ip2ban[_i2bTest] = {time: Date.now(), count:_tempCount+1}; 
										}
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
		} else {
			socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:self.store.RCHash, _value:false, _banned: true});
			if(typeof(socket.end) === 'function'){
				socket.end();
			}
			if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
				delete self.sockets[socket.uid];
			}
		}
	}).on('listening', function(){	//сервер слушает
		_store.connected = true;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:true});
	}).on('close', function(){	//все коннекты уничтожены
		_store.connected = false;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:false});
		self.unsubscribe();
		self.ip2banGCStop();
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
							self.store.dispatchNEW(data[iter]._action);
							break;
						case 'REDUX_CLUSTER_SOCKET_AUTHSTATE':
							if(data[iter]._value === true){
								self.client.write({_msg:'REDUX_CLUSTER_START', _hash:self.store.RCHash});	//синхронизирую хранилище
							}else{
								if(data[iter]._banned)
									self.client.destroy(new Error('your ip is locked for 3 hours'));
								else
									self.client.destroy(new Error('authorization failed'));
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

//функция замены "." на "_" и обратно
function replacer(data_val, value_val){
	if(typeof(data_val) === 'string'){
		if(value_val){
			return data_val.replace(/\./gi,"_");
		} else {
			return data_val.replace(/\_/gi,".");
		}
	}
}

ReduxClusterModule.createStore = createStore; 	//переопределяю функцию создания хранилища

module.exports = ReduxClusterModule;
	
	
	