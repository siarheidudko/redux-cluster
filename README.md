<h1><a id="ReduxCluster_1"></a>Redux-Cluster</h1>
<p>Synchronize your redux storage in a cluster.</p>
<p><a href="https://www.npmjs.com/package/redux-cluster"><img src="https://img.shields.io/npm/v/redux-cluster.svg" alt="npm"></a><br>
<a href="https://www.npmjs.com/package/redux-cluster"><img src="https://img.shields.io/npm/dy/redux-cluster.svg" alt="npm"></a><br>
<a href="https://www.npmjs.com/package/redux-cluster"><img src="https://img.shields.io/npm/l/redux-cluster.svg" alt="NpmLicense"></a><br>
<img src="https://img.shields.io/github/last-commit/siarheidudko/redux-cluster.svg" alt="GitHub last commit"><br>
<img src="https://img.shields.io/github/release/siarheidudko/redux-cluster.svg" alt="GitHub release"></p>
<ul>
<li>Supports native methods of redux.</li>
<li>Uses IPC only (in Basic Scheme) or IPC and Socket (in Cluster Scheme).</li>
<li>Store are isolated and identified by means of hashes.</li>
</ul>
<h2><a id="Install_16"></a>Install</h2>
<pre><code>    npm i redux-cluster --save
</code></pre>
<h2><a id="Use_23"></a>Use</h2>
<p><a href="https://sergdudko.tk/2018/11/14/redux-cluster-%D0%BF%D1%80%D0%BE%D0%B4%D0%BE%D0%BB%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5-%D0%B8%D0%BB%D0%B8-%D1%81%D0%B8%D0%BD%D1%85%D1%80%D0%BE%D0%BD%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F-%D0%BF%D0%B0%D0%BC/" title="Подробное описание RU">Подробное описание RU</a></p>
<h3><a id="Connection_library_27"></a>Connection library</h3>
<pre><code>    var ReduxCluster = require('redux-cluster');
</code></pre>
<h3><a id="Create_store_34"></a>Create store</h3>
<pre><code>    var Test = ReduxCluster.createStore(editProcessStorage);
    
    function editProcessStorage(state = {version:''}, action){ 
        switch (action.type){
            case 'TASK':
                var state_new = {};
                state_new.version = action.payload.version;
                return state_new;
                break;
            default:
                break;
        }
    }
</code></pre>
<h3><a id="Subscribe_updates_53"></a>Subscribe updates</h3>
<pre><code>    Test.subscribe(function(){
        if(Cluster.isMaster){
            var name = 'm';
        } else {
            var name = Cluster.worker.id;
        }
        console.log(Colors.gray(name + ' | ' + JSON.stringify(Test.getState())));
    });
</code></pre>
<h3><a id="Dispatch_event_67"></a>Dispatch event</h3>
<pre><code>    Test.dispatch({type:'TASK', payload: {version:'1111111'}})
</code></pre>
<h3><a id="Error_output_callback_74"></a>Error output callback</h3>
<p>Default is console.error</p>
<pre><code>    Test.stderr = function(err){console.error(err);}
</code></pre>
<h3><a id="Synchronization_mode_82"></a>Synchronization mode</h3>
<p>This mode is enabled for the basic scheme as well.<br>
Set the type of synchronization, the default <code>action</code>.</p>
<ul>
<li>action - send a action of the store status for each action and send a snapshot every 1000 (default, Test.resync) action</li>
<li>snapshot -  send a snapshot of the store status for each action</li>
</ul>
<pre><code>Test.mode = &quot;action&quot;;
</code></pre>
<h3><a id="Snapshot_synchronization_frequency_for_action_mode_94"></a>Snapshot synchronization frequency (for action mode)</h3>
<p>Number of actions before a snapshot of guaranteed synchronization will be sent. Default 1000 actions.</p>
<pre><code>Test.resync = 1000;
</code></pre>
<h3><a id="Create_socket_server_102"></a>Create socket server</h3>
<p>Please familiarize yourself with the architectural schemes before use. In Windows createServer is not supported in child process (named channel write is not supported in the child process), please use as TCP-server.</p>
<pre><code>Test.createServer(&lt;Options&gt;);
</code></pre>
<h5><a id="Example_109"></a>Example</h5>
<pre><code>var Test = ReduxCluster.createStore(reducer);
Test.createServer({path: &quot;./mysock.sock&quot;, logins:{test1:'12345'}});
var Test2 = ReduxCluster.createStore(reducer2);
Test2.createServer({host: &quot;0.0.0.0&quot;, port: 8888, logins:{test2:'123456'}});
</code></pre>
<p>Options &lt;Object&gt; Required:</p>
<ul>
<li>path &lt;String&gt; - name of the file socket (linux) or the name of the named channel (windows), if use as IPC</li>
<li>host &lt;String&gt; - hostname or ip-address (optional, default 0.0.0.0), if use as TCP</li>
<li>port &lt;Integer&gt; - port (optional, default 10001), if use as TCP</li>
<li>logins &lt;Object&gt; - login - password pairs as <code>{login1:password1, login2:password2}</code>.</li>
</ul>
<h3><a id="Create_socket_client_126"></a>Create socket client</h3>
<pre><code>Test.createClient(&lt;Options&gt;);
</code></pre>
<h5><a id="Example_132"></a>Example</h5>
<pre><code>var Test = ReduxCluster.createStore(reducer);
Test.createClient({path: &quot;./mysock.sock&quot;, login:&quot;test1&quot;, password:'12345'});
var Test2 = ReduxCluster.createStore(reducer2);
Test2.createClient({host: &quot;localhost&quot;, port: 8888, login:&quot;test2&quot;, password:'123456'});
</code></pre>
<p>Options &lt;Object&gt; Required:</p>
<ul>
<li>path &lt;String&gt; - name of the file socket (linux, file will be overwritten!) or the name of the named channel (windows), if use as IPC</li>
<li>host &lt;String&gt; - hostname or ip-address (optional, default 0.0.0.0), if use as TCP</li>
<li>port &lt;Integer&gt; - port (optional, default 10001), if use as TCP</li>
<li>login &lt;String&gt; - login in socket</li>
<li>password &lt;String&gt; - password in socket</li>
</ul>
<h3><a id="Connection_status_150"></a>Connection status</h3>
<p>return &lt;Boolean&gt; true if connected, false if disconnected</p>
<pre><code>Test.connected;
</code></pre>
<h3><a id="Connection_role_158"></a>Connection role</h3>
<p>return &lt;Array&gt; role:</p>
<ul>
<li>master (if Master process in Cluster, sends and listen action to Worker)</li>
<li>worker (if Worker process in Cluster, processes and sends action to Master)</li>
<li>server (if use <code>createServer(&lt;Object&gt;)</code>, sends and listen action to Client)</li>
<li>client (if use <code>createClient(&lt;Object&gt;)</code>, processes and sends action to Server)</li>
</ul>
<pre><code>Test.role;
</code></pre>
<h3><a id="Want_to_use_a_web_socket_Connect_the_reduxclusterws_library_171"></a>Want to use a web socket? Connect the redux-cluster-ws library</h3>
<h4><a id="Install_173"></a>Install</h4>
<pre><code>    npm i redux-cluster-ws --save
</code></pre>
<h4><a id="Add_websocket_server_wrapper_and_use_180"></a>Add websocket server wrapper and use</h4>
<pre><code>require('redux-cluster-ws').server(Test);
Test.createWSServer(&lt;Options&gt;);
</code></pre>
<h5><a id="Example_187"></a>Example</h5>
<pre><code>require('redux-cluster-ws').server(Test);
Test.createWSServer({
    host: &quot;0.0.0.0&quot;, 
    port: 8888, 
    logins:{
        test2:'123456'
    }, 
    ssl:{
        key: /path/to/certificate-key,
        crt: /path/to/certificate,
        ca: /path/to/certificate-ca
    }
});

require('redux-cluster-ws').server(Test2);
Test2.createWSServer({
    host: &quot;localhost&quot;, 
    port: 8889, 
    logins:{
        test2:'123456'
    }
});
</code></pre>
<p>Options &lt;Object&gt; Required:</p>
<ul>
<li>host &lt;String&gt; - hostname or ip-address</li>
<li>port &lt;Integer&gt; - port (optional, default 10002)</li>
<li>logins &lt;Object&gt; - login - password pairs as <code>{login1:password1, login2:password2}</code>.</li>
<li>ssl &lt;Object&gt; - path to server certificate (if use as https, default use http).</li>
</ul>
<h4><a id="Add_websocket_client_library_221"></a>Add websocket client library</h4>
<p>Client does not use internal Node libraries for webpack compatibility. Therefore, on the client, you must create a store with the same reducer.</p>
<pre><code>//create Redux Store
var ReduxClusterWS = require('redux-cluster-ws').client;
var Test = ReduxClusterWS.createStore(&lt;Reducer&gt;);

//connect to Redux-Cluster server (use socket.io)
Test.createWSClient(&lt;Options&gt;);
</code></pre>
<h5><a id="Example_233"></a>Example</h5>
<pre><code>var Test = ReduxCluster.createStore(reducer);
Test.createWSClient({host: &quot;https://localhost&quot;, port: 8888, login:&quot;test2&quot;, password:'123456'});
</code></pre>
<p>Options &lt;Object&gt; Required:</p>
<ul>
<li>host &lt;String&gt; - hostname or ip-address (protocol include)</li>
<li>port &lt;Integer&gt; - port (optional, default 10002)</li>
<li>login &lt;String&gt; - login in websocket</li>
<li>password &lt;String&gt; - password in websocket</li>
</ul>
<h3><a id="Save_storage_to_disk_and_boot_at_startup_248"></a>Save storage to disk and boot at startup</h3>
<p>Save storage to disk and boot at startup. It is recommended to perform these actions only in the primary server / master, since they create a load on the file system.<br>
Attention! For Worker and Master, you must specify different paths. Return Promise object.</p>
<pre><code>  Test.backup(&lt;Object&gt;);
</code></pre>
<h5><a id="Example_255"></a>Example</h5>
<pre><code>Test.backup({
    path:'./test.backup', 
    key:&quot;password-for-encrypter&quot;, 
    count:1000
}).catch(function(err){
    ... you handler
});
</code></pre>
<p>Options &lt;Object&gt; Required:</p>
<ul>
<li>path &lt;String&gt; - file system path for backup (Attention! File will be overwritten!)</li>
<li>key &lt;String&gt; - encryption key (can be omitted)</li>
<li>timeout &lt;Integer&gt; - backup timeout (time in seconds for which data can be lost), if count is omitted.</li>
<li>count &lt;Integer&gt; - amount of action you can lose</li>
</ul>
<h2><a id="Architectural_schemes_274"></a>Architectural schemes</h2>
<h4><a id="Basic_Scheme_276"></a>Basic Scheme</h4>
<p><img src="https://github.com/siarheidudko/redux-cluster/raw/master/img/BasicScheme.png" alt="BasicScheme"></p>
<h4><a id="Cluster_Scheme_280"></a>Cluster Scheme</h4>
<p>You can use <code>createServer(&lt;Object&gt;)</code> in any process in cluster (and outside cluster process).<br>
Using <code>createClient(&lt;Object&gt;)</code> is logical in a Master process or a single process. In any case, if you create a <code>createClient(&lt;Object&gt;)</code> in the Worker process, it will not work with the rest of the cluster processes, does not have access to them. So you will have to create <code>createClient(&lt;Object&gt;)</code> in each Worker process that needs access to the Store.</p>
<p><img src="https://github.com/siarheidudko/redux-cluster/raw/master/img/ClusterScheme.png" alt="ClusterScheme"></p>
<h5><a id="Server_Scheme_in_Socket_286"></a>Server Scheme in Socket</h5>
<p><img src="https://github.com/siarheidudko/redux-cluster/raw/master/img/ServerSocketScheme.png" alt="ServerSocketScheme"></p>
<h5><a id="Client_Cluster_Scheme_in_Socket_290"></a>Client (Cluster) Scheme in Socket</h5>
<p><img src="https://github.com/siarheidudko/redux-cluster/raw/master/img/ClientSocketScheme.png" alt="ClientSocketScheme"></p>
<h5><a id="Client_Worker_Scheme_in_Socket_294"></a>Client (Worker) Scheme in Socket</h5>
<p>This is a bad way, it will lead to breaks in the interaction of the ReduxCluster with the Master process.</p>
<p><img src="https://github.com/siarheidudko/redux-cluster/raw/master/img/ClientSocketScheme2.png" alt="ClientSocketScheme2"></p>
<h5><a id="Client_Single_Process_Scheme_in_Socket_299"></a>Client (Single Process) Scheme in Socket</h5>
<p><img src="https://github.com/siarheidudko/redux-cluster/raw/master/img/ClientSocketScheme3.png" alt="ClientSocketScheme3"></p>
<h2><a id="Example_303"></a>Example</h2>
<h4><a id="Basic_Scheme_305"></a>Basic Scheme</h4>
<pre><code>var ReduxCluster = require('./index.js'),
    Cluster = require('cluster'),
    Lodash = require('lodash');
    
var Test = ReduxCluster.createStore(editProcessStorage);
    
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

Test.subscribe(function(){
    if(Cluster.isMaster){
        var name = 'm';
    } else {
        var name = Cluster.worker.id;
    }
    console.log(name + ' | ' + JSON.stringify(Test.getState()));
});

if(Cluster.isMaster){
    for(var i=0; i &lt; 3; i++){
        setTimeout(function(){Cluster.fork();}, i*10000)
    }
    Test.dispatch({type:'TASK', payload: {version:'MasterTest'}});
} else {
    Test.dispatch({type:'TASK', payload: {version:'WorkerTest'+Cluster.worker.id}});
}
</code></pre>
<h4><a id="Cluster_Scheme_Server_350"></a>Cluster Scheme Server</h4>
<pre><code>var ReduxCluster = require('./index.js'),
    Cluster = require('cluster'),
    Lodash = require('lodash');
    
var Test = ReduxCluster.createStore(editProcessStorage);

if(Cluster.isMaster){
    Test.createServer({path: &quot;./mysock.sock&quot;, logins:{test1:'12345'}});
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

Test.subscribe(function(){
    if(Cluster.isMaster){
        var name = 'm';
    } else {
        var name = Cluster.worker.id;
    }
    console.log(' S1 | ' + name + ' | ' + JSON.stringify(Test.getState()));
});

if(Cluster.isMaster){
    for(var i=0; i &lt; 1; i++){
        setTimeout(function(){Cluster.fork();}, i*10000);
    }
    var i = 0;
    setInterval(function(){
        Test.dispatch({type:'TASK', payload: {version:'MasterTest'+i}});
        i++;
    }, 19000);
} else {
    var i = 0;
    setInterval(function(){
        Test.dispatch({type:'TASK', payload: {version:'WorkerTest'+i}});
        i++;
    }, 31000+(Cluster.worker.id*3600), i);
}
</code></pre>
<h4><a id="Cluster_Scheme_Client_407"></a>Cluster Scheme Client</h4>
<pre><code>var ReduxCluster = require('./index.js'),
    Cluster = require('cluster'),
    Lodash = require('lodash');
    
var Test = ReduxCluster.createStore(editProcessStorage);

if(Cluster.isMaster){
    Test.createClient({path: &quot;./mysock.sock&quot;, login:&quot;test1&quot;, password:'12345'});
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

Test.subscribe(function(){
    if(Cluster.isMaster){
        var name = 'm';
    } else {
        var name = Cluster.worker.id;
    }
    console.log(name + ' | ' + JSON.stringify(Test.getState()));
});

if(Cluster.isMaster){
    for(var i=0; i &lt; 2; i++){
        setTimeout(function(){Cluster.fork();}, i*8000);
    }
    var i = 0;
    setInterval(function(){
        Test.dispatch({type:'TASK', payload: {version:'OneRemoteMasterTest'+i}});
        i++;
    }, 11000);
} else {
    var i = 0;
    setInterval(function(){
        Test.dispatch({type:'TASK', payload: {version:'OneRemoteWorkerTest'+i}});
        i++;
    }, 22000+(Cluster.worker.id*1500), i);
}
</code></pre>
<h2><a id="LICENSE_464"></a>LICENSE</h2>
<p>MIT</p>