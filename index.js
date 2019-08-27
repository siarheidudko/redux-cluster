/**
 *	Redux-Cluster
 *	(c) 2018 by Siarhei Dudko.
 *
 *	Cluster (default IPC cluster channel) module for redux synchronizes all redux store in cluster processes (v.1.0.x).
 *	Cluster (default IPC cluster channel) and Socket (custom IPC or TCP channel) for redux synchronizes all redux store (v.1.1.x).
 *  Use new Parser and Zlib Stream (v.1.6.x).
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
	Objectstream = require('@sergdudko/objectstream'),
	Eventstream = require('event-stream'),
	Fs = require('fs'),
	Stream = require('stream'),
	Zlib = require('zlib');
	
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
		if(_ReduxCluster.role.indexOf("client") === -1) { _ReduxCluster.role.push("client"); } else {
			throw new Error('One storage cannot be connected to two servers at the same time.');
		}
		if(_ReduxCluster.role.indexOf("worker") !== -1) { _ReduxCluster.role.splice(_ReduxCluster.role.indexOf("worker"), 1); } //удаляю роль воркера, т.к. IPC Master->Worker уничтожена (не обрабатывается)
		_ReduxCluster.connected = false;
		return new createClient(_ReduxCluster, _settings);
	}
	return _ReduxCluster;
}

function createServer(_store, _settings){	//объект создания сервера
	_store.Server = this;
	_store.Server.uid = generateUID();
	_store.Server.sockets = {};
	_store.Server.database = {};
	_store.Server.ip2ban = {};
	_store.Server.ip2banTimeout = 10800000;
	_store.Server.ip2banGCStart = setInterval(function(){
		for(const key in _store.Server.ip2ban){
			if((_store.Server.ip2ban[key].time+_store.Server.ip2banTimeout) < Date.now()){
				delete _store.Server.ip2ban[key];
			}
		}
	}, 60000);
	_store.Server.ip2banGCStop = function(){ clearInterval(_store.Server.ip2banGCStart); }
	_store.Server.listen = {port:10001};	//дефолтные настройки
	if(typeof(_settings) === 'object'){	//переопределяю конфиг
		if(typeof(_settings.path) === 'string'){
			switch(Os.platform ()){
				case 'win32':
					_store.Server.listen = {path:Path.join('\\\\?\\pipe', _settings.path)};
					break;
				default:
					_store.Server.listen = {path:Path.join(_settings.path)};
					break;
			}
		} else{
			if(typeof(_settings.host) === 'string')
				_store.Server.listen.host = _settings.host;
			if(typeof(_settings.port) === 'number')
				_store.Server.listen.port = _settings.port;
		}
		if(typeof(_settings.logins) === 'object')
			for(const login in _settings.logins){ _store.Server.database[hasher("REDUX_CLUSTER"+login)] = hasher("REDUX_CLUSTER"+_settings.logins[login]); }
	}
	_store.Server.sendtoall = function(_message){
		if(typeof(_message) === 'object'){
			for(const uid in _store.Server.sockets){
				_store.Server.sockets[uid].write(_message);
			}
		} else {
			for(const uid in _store.Server.sockets){
				_store.Server.sockets[uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:_store.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:_store.getState()}});
			}
		}
	}
	if(_store.mode === "action")	//переопределяю функцию отправки в сокеты (вызывается редьюсером первичного мастера)
		_store.allsock[_store.Server.uid] = _store.Server;
	_store.Server.unsubscribe = _store.subscribe(function(){	//подписываю сокет на изменения Redux только в режиме snapshot
		if(_store.mode === "snapshot")
			_store.Server.sendtoall();
	});
	_store.Server.server = Net.createServer((socket) => {
		let _i2bTest = replacer(socket.remoteAddress, true);
		let _uid = generateUID();
		socket.uid = _uid;
		socket.writeNEW = socket.write;	//переопределяю write (объектный режим + сжатие)
		socket.write = function(_data){
			try{
				return socket.writeNEW(Zlib.gzipSync(Buffer.from(JSON.stringify(_data))));
			} catch(err){
				_store.stderr('ReduxCluster.createServer write error: '+err.message);
				return;
			}
		}
		socket.on('error', function(err){ //обработка ошибок сокета
			_store.stderr('ReduxCluster.createServer client error: '+err.message);
			if(typeof(socket.end) === 'function'){
				socket.end();
			}
			if((typeof(socket.uid) !== 'undefined') && (typeof(_store.Server.sockets[socket.uid]) !== 'undefined')){
				delete _store.Server.sockets[socket.uid];
			}
		});
		if((typeof(_i2bTest) === 'undefined') || (typeof(_store.Server.ip2ban[_i2bTest]) === 'undefined') || ((typeof(_store.Server.ip2ban[_i2bTest]) === 'object') && ((_store.Server.ip2ban[_i2bTest].count < 5) || ((_store.Server.ip2ban[_i2bTest].time+_store.Server.ip2banTimeout) < Date.now())))){
			_store.Server.parser = new Objectstream.Parser();
			_store.Server.mbstring = new Stream.Transform({	//обработка мультибайтовых символов без присвоенной кодировки может срабатывать некорректно
				transform(_buffer, encoding, callback) {
					this.push(_buffer)
					return callback();
				}
			});
			_store.Server.mbstring.setEncoding('utf8');
			_store.Server.gunzipper = Zlib.createGunzip();	//поток декомпрессии
			_store.Server.event = Eventstream.map(function (data, next1) {
				if(data._hash === _store.RCHash){	//проверяю что сообщение привязано к текущему хранилищу
					switch(data._msg){
						case 'REDUX_CLUSTER_MSGTOMASTER': 	//получаю диспатчер от клиента
							if((typeof(socket.uid) !== 'undefined') && (typeof(_store.Server.sockets[socket.uid]) !== 'undefined')){
								if(data._action.type === 'REDUX_CLUSTER_SYNC')
									throw new Error("Please don't use REDUX_CLUSTER_SYNC action type!");
								_store.dispatch(data._action);
							}
							break;
						case 'REDUX_CLUSTER_START':	//получаю метку, что клиент запущен
							if((typeof(socket.uid) !== 'undefined') && (typeof(_store.Server.sockets[socket.uid]) !== 'undefined')){
								_store.Server.sockets[socket.uid].write({_msg:"REDUX_CLUSTER_MSGTOWORKER", _hash:_store.RCHash, _action:{type:"REDUX_CLUSTER_SYNC", payload:_store.getState()}});
							}
							break;
						case 'REDUX_CLUSTER_SOCKET_AUTH':
							if( (typeof(data._login) !== 'undefined') && 
								(typeof(data._password) !== 'undefined') &&
								(typeof(_store.Server.database[data._login]) !== 'undefined') && 
								(_store.Server.database[data._login] === data._password)){
								   _store.Server.sockets[socket.uid] = socket;
								   if((typeof(_i2bTest) === 'string') && (typeof(_store.Server.ip2ban[_i2bTest]) === 'object')) { delete _store.Server.ip2ban[_i2bTest]; } //если логин присутствует в таблице забаненных удаляю
								   socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:_store.RCHash, _value:true});
								} else {
									if(typeof(_i2bTest) === 'string') { 
										let _tempCount = 0;
										if(typeof(_store.Server.ip2ban[_i2bTest]) === 'object'){ 
											_tempCount = _store.Server.ip2ban[_i2bTest].count; 
											if(_tempCount >= 5) { _tempCount = 0; } //по таймауту сбрасываю счетчик попыток
										}
										_store.Server.ip2ban[_i2bTest] = {time: Date.now(), count:_tempCount+1}; 
									}
									socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:_store.RCHash, _value:false});
									if(typeof(socket.end) === 'function'){
										socket.end();
									}
									if((typeof(socket.uid) !== 'undefined') && (typeof(_store.Server.sockets[socket.uid]) !== 'undefined')){
										delete _store.Server.sockets[socket.uid];
									}
								}
							break;
					}
				}
				next1();
			});
			_store.Server.gunzipper.on('error',function(err){
				_store.stderr('ReduxCluster.createServer gunzipper error: '+err);
			});
			_store.Server.mbstring.on('error',function(err){
				_store.stderr('ReduxCluster.createServer mbstring error: '+err);
			});
			_store.Server.parser.on('error',function(err){
				_store.stderr('ReduxCluster.createServer parser error: '+err);
			});
			_store.Server.event.on('error',function(err){
				_store.stderr('ReduxCluster.createServer event error: '+err);
			});
			socket.pipe(_store.Server.gunzipper).pipe(_store.Server.mbstring).pipe(_store.Server.parser).pipe(_store.Server.event);
		} else {
			socket.write({_msg:"REDUX_CLUSTER_SOCKET_AUTHSTATE", _hash:_store.RCHash, _value:false, _banned: true});
			if(typeof(socket.end) === 'function'){
				socket.end();
			}
			if((typeof(socket.uid) !== 'undefined') && (typeof(_store.Server.sockets[socket.uid]) !== 'undefined')){
				delete _store.Server.sockets[socket.uid];
			}
		}
	}).on('listening', function(){	//сервер слушает
		_store.connected = true;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:true});
	}).on('close', function(){	//все коннекты уничтожены
		_store.connected = false;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:false});
		_store.Server.unsubscribe();
		_store.Server.ip2banGCStop();
		delete _store.allsock[_store.Server.uid];
		setTimeout(function(){ new createServer(_store, _settings); }, 10000);
	}).on('error', function(err){ //обработка ошибок сервера
		_store.stderr('ReduxCluster.createServer socket error: '+err.message);
		if(typeof(_store.Server.server.close) === 'function')
			_store.Server.server.close();
	});
	if(typeof(_store.Server.listen.path) === 'string'){
		Fs.unlink(_store.Server.listen.path, function(err){
			if(err && err.message.toLowerCase().indexOf("no such file or directory") === -1)
				_store.stderr('ReduxCluster.createServer socket error: '+err);
			_store.Server.server.listen(_store.Server.listen);
		});
	} else {
		_store.Server.server.listen(_store.Server.listen);
	}
}

function createClient(_store, _settings){	//объект создания клиента
	_store.Client = this;
	_store.Client.listen = {port:10001};	//дефолтные настройки
	if(typeof(_settings) === 'object'){	//переопределяю конфиг
		if(typeof(_settings.path) === 'string'){
			switch(Os.platform ()){
				case 'win32':
					_store.Client.listen = {path:Path.join('\\\\?\\pipe', _settings.path)};
					break;
				default:
					_store.Client.listen = {path:Path.join(_settings.path)};
					break;
			}
		} else{
			if(typeof(_settings.host) === 'string')
				_store.Client.listen.host = _settings.host;
			if(typeof(_settings.port) === 'number')
				_store.Client.listen.port = _settings.port;
		}
		if(typeof(_settings.login) === 'string')
			_store.Client.login = hasher("REDUX_CLUSTER"+_settings.login);
		if(typeof(_settings.password) === 'string')
			_store.Client.password = hasher("REDUX_CLUSTER"+_settings.password);
	}
	_store.Client.client = new Net.createConnection(_store.Client.listen);
	_store.Client.parser = new Objectstream.Parser();
	_store.Client.mbstring = new Stream.Transform({	//обработка мультибайтовых символов без присвоенной кодировки может срабатывать некорректно
		transform(_buffer, encoding, callback) {
			this.push(_buffer)
			return callback();
		}
	});
	_store.Client.mbstring.setEncoding('utf8');
	_store.Client.gunzipper = Zlib.createGunzip();	//поток декомпрессии
	_store.Client.event = Eventstream.map(function (data, next1) {
		if(!_store.Client.client.destroyed){
			if(data._hash === _store.RCHash){
				switch(data._msg){
					case 'REDUX_CLUSTER_MSGTOWORKER':
						_store.dispatchNEW(data._action);
						break;
					case 'REDUX_CLUSTER_SOCKET_AUTHSTATE':
						if(data._value === true){
							_store.Client.client.write({_msg:'REDUX_CLUSTER_START', _hash:_store.RCHash});	//синхронизирую хранилище
						}else{
							if(data._banned)
								_store.Client.client.destroy(new Error('your ip is locked for 3 hours'));
							else
								_store.Client.client.destroy(new Error('authorization failed'));
						}
						break;
				}
			}
		}
		next1();
	});
	_store.Client.gunzipper.on('error',function(err){
		_store.stderr('ReduxCluster.createClient gunzipper error: '+err);
	});
	_store.Client.mbstring.on('error',function(err){
		_store.stderr('ReduxCluster.createClient mbstring error: '+err);
	});
	_store.Client.parser.on('error',function(err){
		_store.stderr('ReduxCluster.createClient parser error: '+err);
	});
	_store.Client.event.on('error',function(err){
		_store.stderr('ReduxCluster.createClient event error: '+err);
	});
	_store.Client.client.on('connect', function(){
		_store.connected = true;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:true});
		_store.Client.client.writeNEW = _store.Client.client.write;	//переопределяю write  (объектный режим + сжатие)
		_store.Client.client.write = function(_data){
			try {
				return _store.Client.client.writeNEW(Zlib.gzipSync(Buffer.from(JSON.stringify(_data))));
			} catch(err){
				_store.stderr('ReduxCluster.createClient write error: '+err.message);
				return;
			}
		}
		if(typeof(_store.dispatchNEW) !== 'function'){	//переопределяю dispatch для мастера
			_store.dispatchNEW = _store.dispatch;
		}
		_store.dispatch = function(_data){
			_store.Client.client.write({_msg:'REDUX_CLUSTER_MSGTOMASTER', _hash:_store.RCHash, _action:_data});
		}
		_store.Client.client.write({_msg:'REDUX_CLUSTER_SOCKET_AUTH', _hash:_store.RCHash, _login:_store.Client.login, _password:_store.Client.password});	//авторизация в сокете
	}).on('close', function(){
		_store.connected = false;
		_store.sendtoall({_msg:"REDUX_CLUSTER_CONNSTATUS", _hash:_store.RCHash, _connected:false});
		setTimeout(function(){ new createClient(_store, _settings); }, 250);
	}).on('error', function(err){ //обработка ошибок клиента
		_store.stderr('ReduxCluster.createClient client error: '+err.message);
	}).pipe(_store.Client.gunzipper).pipe(_store.Client.mbstring).pipe(_store.Client.parser).pipe(_store.Client.event);
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