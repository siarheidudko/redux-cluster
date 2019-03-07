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
	Os = require('os'),
	Jsonstream = require('JSONStream'),
	Eventstream = require('event-stream'),
	Fs = require('fs');
	
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

function encrypter(data, pass){	//енкриптор
	const cipher = Crypto.createCipher('aes192', hasher(pass));
	let encrypted = cipher.update(data, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	return encrypted;
}

function decrypter(data, pass){	//декриптор
	const cipher = Crypto.createDecipher('aes192', hasher(pass));
	let decrypted = cipher.update(data, 'hex', 'utf8');
	decrypted += cipher.final('utf8');
	return decrypted;
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
	let self = this;
	self.stderr = console.error;	//callback для ошибок
	self.role = [];		//роль
	self.mode = "action";	//тип синхронизации по умолчанию
	self.connected = false;		//статус соединения
	self.resync = 1000;		//количество действий для пересинхронизации
	self.RCHash = hasher(_reducer.name);	//создаю метку текущего редьюсера для каждого экземпляра
	self.version = require('./package.json').version;	//версия пакета
	self.homepage = require('./package.json').homepage;	//домашняя страница пакета
	self.altReducer = _reducer;	//оригинальный редьюсер
	self.allsock = {};	//сервера
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
	self.sendtoallsock = function(_message){	//отправка сообщений во все сокеты
		for(const id in self.allsock){
			if((typeof(self.allsock[id]) === 'object') && (typeof(self.allsock[id].sendtoall) === 'function'))
				setTimeout(self.allsock[id].sendtoall, 1, _message);
		}
	};	
	try{
		let _d = self.altReducer(undefined, {});	//получаю значение state при старте
		if(typeof(_d) === 'object'){
			self.defaulstate = _d;
		} else {
			throw new Error('The returned value is not an object.');
		}
	} catch(e){
		self.defaulstate = {};
	};
	self.newReducer = function(state=self.defaulstate, action){	//собственный редьюсер
		if(self.mode === "action"){	//в режиме action отправляем action в воркеры и сокеты
			if((typeof(self.counter) === 'undefined') || (self.counter === self.resync))
				self.counter = 1;
			else
				self.counter++;
			if(self.counter === self.resync){	//каждый N-action синхронизируем хранилище (на случай рассинхронизации)
				if(self.role.indexOf("master") !== -1)
					setTimeout(self.sendtoall, 100);
				if(self.role.indexOf("server") !== -1)
					setTimeout(self.sendtoallsock, 100);
			}
			if(self.role.indexOf("master") !== -1)
				setTimeout(self.sendtoall, 1, {_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.RCHash, _action:action});
			if(self.role.indexOf("server") !== -1)
				setTimeout(self.sendtoallsock, 1, {_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.RCHash, _action:action});
		}
		if (action.type === 'REDUX_CLUSTER_SYNC'){
			let state_new = Lodash.clone(action.payload);
			return state_new;
		} else { 
			return self.altReducer(state, action);
		}
	}
	Object.assign(self, Redux.createStore(self.newReducer));	//создаю хранилище с собственным редьюсером
	delete self.replaceReducer;	//удаляю замену редьюсера
	self.backup = function(object){
		let _object = Lodash.clone(object);
		return new Promise(function(resolve, reject){
			loadBackup().then(function(val){
				new createBackup();
				resolve(true);
			}).catch(function(err){
				if(err && err.message.toLowerCase().indexOf("no such file or directory") !== -1){
					new createBackup();
					resolve(true);
				} else {
					reject(err);
				}
			});
		});
		function loadBackup(){
			return new Promise(function(res, rej){
				Fs.readFile(_object["path"], function(_err,_data){
					if(_err){
						rej(new Error('ReduxCluster.backup load error: '+_err.message));
					} else {
						try{
							let _string = _data.toString();
							if(typeof(_object["key"]) !== 'undefined')
								_string = decrypter(_string, _object["key"]);
							let _obj = JSON.parse(_string);
							if(typeof(self.dispatchNEW) === 'function')
								self.dispatchNEW({type:"REDUX_CLUSTER_SYNC", payload:_obj});
							else
								self.dispatch({type:"REDUX_CLUSTER_SYNC", payload:_obj});
							setTimeout(function(){
								res(true);
							}, 500);
						} catch (_e) {
							rej(new Error('ReduxCluster.backup decoding error: '+_e.message))
						}
					}
				});
			});
		}
		function createBackup(){
			let _createBackup = this;
			_createBackup.c = 0;
			_createBackup.allowed = true;
			_createBackup.disable = self.subscribe(function(){	//подписываю на обновление
				if(typeof(_object['timeout']) === 'number'){	//приоритетная настройка
					if(_createBackup.allowed){	//запись разрешена
						_createBackup.allowed = false;	//запрещаю повторный запуск
						setTimeout(function(){
							_createBackup.write(true);
						},_object['timeout']*1000);
					}
				} else {
					let _update = false;
					if(typeof(_object['count']) === 'number'){	//проверяю счетчик
						_createBackup.c++;
						if(_createBackup.c === _object['count']){
							_createBackup.c = 0;
						}
						if(_createBackup.c === 0){
							_update = true;
						}
					}
					if(_update){
						_createBackup.write();
					}
				}
			});
			_createBackup.write = function(_restart, _callback){	//запись в fs
				if(_createBackup.allowed || _restart){
					try{
						let _string = JSON.stringify(self.getState());
						if(typeof(_object['key']) !== 'undefined'){
							try{
								_string = encrypter(_string, _object['key']);
								backupwrite();
							} catch(_err){
								self.stderr('ReduxCluster.backup encrypt error: '+_err);
							}
						} else {
							backupwrite();
						}
						function backupwrite(){
							let _resultBackup = Fs.writeFileSync(_object['path'], _string, (_err) => {
								if (_err) {
									self.stderr('ReduxCluster.backup write error: '+_err);
									_createBackup.allowed = false;
									setTimeout(_createBackup.write, 1000, true, _callback);
								}
							});
							if(typeof(_resultBackup) === 'undefined'){
								_createBackup.allowed = true;
								if(typeof(_callback) === 'function'){
									_callback(true);
								}
							}
						}
					} catch(_e){
						self.stderr('ReduxCluster.backup write error: '+_e);
						_createBackup.allowed = false;
						setTimeout(_createBackup.write, 1000, true, _callback);
					}
				}
			}
		}
	}
	if(Cluster.isMaster){ //мастер
		if(self.role.indexOf("master") === -1) { self.role.push("master"); }
		self.unsubscribe = self.subscribe(function(){	//подписываю отправку снимков при изменении только в режиме snapshot
			if(self.mode === "snapshot")
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
	let _ReduxCluster = new ReduxCluster(_reducer);		//создаю экземпляр хранилища
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
	let self = this;
	self.uid = generateUID();
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
	self.sendtoall = function(_message){
		if(typeof(_message) === 'object'){
			for(const uid in self.sockets){
				self.sockets[uid].write(_message);
			}
		} else {
			for(const uid in self.sockets){
				self.sockets[uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.store.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:self.store.getState()}});
			}
		}
	}
	if(self.store.mode === "action")	//переопределяю функцию отправки в сокеты (вызывается редьюсером первичного мастера)
		self.store.allsock[self.uid] = self;
	self.unsubscribe = self.store.subscribe(function(){	//подписываю сокет на изменения Redux только в режиме snapshot
		if(self.store.mode === "snapshot")
			self.sendtoall();
	});
	self.server = Net.createServer((socket) => {
		let _i2bTest = replacer(socket.remoteAddress, true);
		let _uid = generateUID();
		socket.uid = _uid;
		socket.writeNEW = socket.write;	//переопределяю write (объектный режим)
		socket.write = function(_data){
			try{
				return socket.writeNEW(Buffer.from(JSON.stringify(_data)));
			} catch(err){
				self.store.stderr('ReduxCluster.createServer write error: '+err.message);
				return;
			}
		}
		socket.on('error', function(err){ //обработка ошибок сокета
			self.store.stderr('ReduxCluster.createServer client error: '+err.message);
			if(typeof(socket.end) === 'function'){
				socket.end();
			}
			if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
				delete self.sockets[socket.uid];
			}
		});
		if((typeof(_i2bTest) === 'undefined') || (typeof(self.ip2ban[_i2bTest]) === 'undefined') || ((typeof(self.ip2ban[_i2bTest]) === 'object') && ((self.ip2ban[_i2bTest].count < 5) || ((self.ip2ban[_i2bTest].time+self.ip2banTimeout) < Date.now())))){
			self.parser = Jsonstream.parse();
			self.event = Eventstream.map(function (data, next1) {
				if(data._hash === self.store.RCHash){	//проверяю что сообщение привязано к текущему хранилищу
					switch(data._msg){
						case 'REDUX_CLUSTER_MSGTOMASTER': 	//получаю диспатчер от клиента
							if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
								if(data._action.type === 'REDUX_CLUSTER_SYNC')
									throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
								self.store.dispatch(data._action);
							}
							break;
						case 'REDUX_CLUSTER_START':	//получаю метку, что клиент запущен
							if((typeof(socket.uid) !== 'undefined') && (typeof(self.sockets[socket.uid]) !== 'undefined')){
								self.sockets[socket.uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:self.store.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:self.store.getState()}});
							}
							break;
						case 'REDUX_CLUSTER_SOCKET_AUTH':
							if( (typeof(data._login) !== 'undefined') && 
								(typeof(data._password) !== 'undefined') &&
								(typeof(self.database[data._login]) !== 'undefined') && 
								(self.database[data._login] === data._password)){
								   self.sockets[socket.uid] = socket;
								   if((typeof(_i2bTest) === 'string') && (typeof(self.ip2ban[_i2bTest]) === 'object')) { delete self.ip2ban[_i2bTest]; } //если логин присутствует в таблице забаненных удаляю
								   socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:self.store.RCHash, _value:true});
								} else {
									if(typeof(_i2bTest) === 'string') { 
										let _tempCount = 0;
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
				next1();
			});
			self.parser.on('error',function(err){
				self.store.stderr('ReduxCluster.createServer parser error: '+err);
			});
			self.event.on('error',function(err){
				self.store.stderr('ReduxCluster.createServer parser error: '+err);
			});
			socket.pipe(self.parser).pipe(self.event);
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
		delete _store.allsock[self.uid];
		setTimeout(createServer, 10000, _store, _settings);
	}).on('error', function(err){ //обработка ошибок сервера
		self.store.stderr('ReduxCluster.createServer socket error: '+err.message);
		if(typeof(self.server.close) === 'function')
			self.server.close();
	});
	if(typeof(self.listen.path) === 'string'){
		Fs.unlink(self.listen.path, function(err){
			if(err && err.message.toLowerCase().indexOf("no such file or directory") === -1)
				self.store.stderr('ReduxCluster.createServer socket error: '+err);
			self.server.listen(self.listen);
		});
	} else {
		self.server.listen(self.listen);
	}
}

function createClient(_store, _settings){	//объект создания клиента
	let self = this;
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
	self.parser = Jsonstream.parse();
	self.event = Eventstream.map(function (data, next1) {
		if(!self.client.destroyed){
			if(data._hash === self.store.RCHash){
				switch(data._msg){
					case 'REDUX_CLUSTER_MSGTOWORKER':
						self.store.dispatchNEW(data._action);
						break;
					case 'REDUX_CLUSTER_SOCKET_AUTHSTATE':
						if(data._value === true){
							self.client.write({_msg:'REDUX_CLUSTER_START', _hash:self.store.RCHash});	//синхронизирую хранилище
						}else{
							if(data._banned)
								self.client.destroy(new Error('your ip is locked for 3 hours'));
							else
								self.client.destroy(new Error('authorization failed'));
						}
						break;
				}
			}
		}
		next1();
	});
	self.parser.on('error',function(err){
		self.store.stderr('ReduxCluster.createClient parser error: '+err);
	});
	self.event.on('error',function(err){
		self.store.stderr('ReduxCluster.createClient parser error: '+err);
	});
	self.client.on('connect', function(){
		_store.connected = true;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:true});
		self.client.writeNEW = self.client.write;	//переопределяю write (объектный режим)
		self.client.write = function(_data){
			try {
				return self.client.writeNEW(Buffer.from(JSON.stringify(_data)));
			} catch(err){
				self.store.stderr('ReduxCluster.createClient write error: '+err.message);
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
		self.store.stderr('ReduxCluster.createClient client error: '+err.message);
	}).pipe(self.parser).pipe(self.event);
}

//генерация uid
function generateUID() { 
	let d = new Date().getTime();
	if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
		d += performance.now(); 
	}
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		let r = (d + Math.random() * 16) % 16 | 0;
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
ReduxClusterModule.functions = {
	generateUID: generateUID,
	replacer: replacer,
	hasher: hasher,
	encrypter: encrypter,
	decrypter: decrypter
};

module.exports = ReduxClusterModule;
	