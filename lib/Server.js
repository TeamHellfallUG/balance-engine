"use strict";

const EventEmitter = require("events");

const Promise = require("bluebird");
const UWebSocketServer = require("uws").Server;

const Redis = require("ioredis");
const uuid = require("uuid");

const {reflect} = require("./tools/index.js");

const WSS_MESSAGES_TOPIC_OUT = "wss:messages:topic:out";
const WSS_MESSAGES_TOPIC_GLOBAL = "wss:messages:topic:global";

class Server extends EventEmitter {

    constructor({host, port, redis, log, engine, debug}){
        super();

        host = host || "localhost";
        this.enableDebug = debug || false;
        //engine is switchable
        engine = engine || "uws";
        this.wss = null;
        switch(engine){

            case "uws":
                this.wss = new UWebSocketServer({
                    host,
                    port
                });
                break;

            default:
                throw new Error("engine " + engine + " is not supported. Available: [wss, udpws]");
        }

        this.originId = "o:" + uuid.v4();
        this.clients = [];
        this._redisConf = redis;

        //outgoing socket messages
        this.redisPubOut = new Redis(redis);
        this.redisSubOut = new Redis(redis);

        //global server messages
        this.redisPubGlobal = new Redis(redis);
        this.redisSubGlobal = new Redis(redis);

        this._log = log;
        this._redisClient = null;

        this.log(`server up @ ${host}:${port} engine: ${engine} as origin: ${this.originId}.`);
    }

    log(message){

        if(!this._log){
            return false;
        }

        if(typeof message !== "string"){
            message = JSON.stringify(message);
        }

        this._log(message);
        return true;
    }

    debug(message){
        if(this.enableDebug){
            this.log(message);
        }
    }

    open(){
        return new Promise((resolve, reject) => {

            this.log("opening server as origin: " + this.originId + "..");

            this.redisSubOut.subscribe(WSS_MESSAGES_TOPIC_OUT, (err, count) => {

                if(err || !count){
                    return reject("Failed to connect to redis: " + err.message);
                }

                this.redisSubGlobal.subscribe(WSS_MESSAGES_TOPIC_GLOBAL, (err, count) => {

                    if(err || !count){
                        return reject("Failed to connect to redis: " + err.message);
                    }

                    this.log("redis subscription(s) done.");

                    this.redisSubOut.on("message", (channel, message) => {

                        if(channel === WSS_MESSAGES_TOPIC_OUT){
                            this._onMessageOut(message);
                        }
                    });

                    this.redisSubGlobal.on("message", (channel, message) => {

                        if(channel === WSS_MESSAGES_TOPIC_GLOBAL){
                            this._onMessageGlobal(message);
                        }
                    });

                    this.wss.on("connection", this._onConnection.bind(this));
                    this.log("listening for connections.");
                    resolve(true);
                });
            });
        });
    }

    close(){

        this.log("closing server " + this.originId);

        this.wss.close();

        this.redisPubOut.quit();
        this.redisSubOut.quit();

        this.redisPubGlobal.quit();
        this.redisSubGlobal.quit();
    }

    /**
     * sends a message to a client for the given clientId
     * if the client's socket does not exist on this server the message will be forwarded to all other servers
     * @param clientId
     * @param message
     * @returns {Promise.<number>}
     */
    send(clientId, message){

        //this.log("trying to send message to " + clientId);

        return this._send(clientId, message).then(r => 1, e => {

            if(e !== "NOT_EXIST"){
                return e;
            }

            //socket is not opened on this server
            //call the others

            this._publishOut({
                clientId,
                originId: this.originId,
                message
            });

            return 2;
        });
    }

    /**
     * sends a message to a list of clients for their given clientIds
     * if a client's socket does not exist on this server the message will be forwarded to all other servers
     * @param clientIds
     * @param message
     * @returns {*}
     */
    sendList(clientIds, message){

        if(!Array.isArray(clientIds)){
            return Promise.reject("clientIds must be an array.");
        }

        if(typeof message !== "string"){
            message = JSON.stringify(message);
        }

        //this.log("trying to send a message to " + clientIds.length + " clients.");

        return this._sendList(clientIds, message);
    }

    /**
     * broadcasts to all clients with their socket connected to this server
     */
    broadcast(message){
        this.debug("trying to broadcast message.");
        return Promise.all(this.clients.map(c => c.socket).map(socket => {
            return new Promise(resolve => {
                socket.send(message, err => { resolve(!err); });
            });
        }));
    }

    /**
     * broadcasts to all client accross all servers
     */
    broadcastGlobal(message){
        this.debug("trying to globally broadcast message.");
        this._publishGlobal("broadcast", message, true);
    }

    /* ### PRIVATE API ### */

    _send(clientId, message){

        const {client} = this._getClientForId(clientId);

        if(!client){
            this.debug("client " + clientId + " does not exist on this server.");
            return Promise.reject("NOT_EXIST");
        }

        if(typeof message !== "string"){
            message = JSON.stringify(message);
        }

        return this._sendPromise(client.socket, message, clientId);
    }

    _sendPromise(socket, message, clientId = "unknown"){
        return new Promise((resolve, reject) => {

            if(!socket){
                return reject("client has no socket.");
            }

            socket.send(message, (err, result) => {

                if(err){
                    this.debug("failed to send message to client " + clientId + " because: " + err.message);
                    reject(err);
                }

                this.debug("message sent to client " + clientId);
                resolve(result);
            });
        });
    }

    _sendList(clientIds, message) {

        const onServer = [];
        const notOnServer = [];

        let i = -1;
        let client = null;
        for (i = 0; i < clientIds.length; i++) {
            client = this._getClientForId(clientIds[i]).client;
            if (client) {
                onServer.push(client);
            } else {
                notOnServer.push(clientIds);
            }
        }

        if(notOnServer.length > 0) {
            this.debug("cannot send full list instantly as " + notOnServer.length + " sockets are not on this server.");
        }

        //let the other servers handle these sockets
        for (i = 0; i < notOnServer.length; i++) {

            this._publishOut({
                clientId: notOnServer[i],
                originId: this.originId,
                message
            });
        }

        //and send to all clients on this server
        return Promise.all(onServer.map(client =>
            reflect(this._sendPromise(client.socket, message, client.clientId))));
    }

    _publishOut(message){

        if(!message){
            return false;
        }

        if(typeof message !== "string"){
            message = JSON.stringify(message);
        }

        this.redisPubOut.publish(WSS_MESSAGES_TOPIC_OUT, message);
        this.debug("message-out published => " + message.length);
        return true;
    }

    _publishGlobal(type, message, toSelf = false){

        if(!message){
            return false;
        }

        message = JSON.stringify({
            type,
            message,
            toSelf,
            originId: this.originId
        });

        this.redisPubGlobal.publish(WSS_MESSAGES_TOPIC_GLOBAL, message);
        this.debug("message-global published => " + message.length);
        return true;
    }

    _onConnection(socket){

        const clientId = "c:" + uuid.v4();
        this.log("new socket tagged as client: " + clientId);

        const client = {
            clientId,
            socket,
            created: Date.now()
        };

        this.clients.push(client);

        socket.on("message", message => {
            const length = message.length;
            this.debug("received new message-in => " + length + " from client " + clientId);

            /**
             * listen via server.on("message", clientId, message){}
             */
            this.emit("message", clientId, message);
        });

        socket.on("close", () => {
            this.log("client " + clientId + " closed the connection.");
            if(this._removeClientForId(clientId)){

                this.emit("internal", {
                    clientId,
                    header: "CLOSE",
                    content: {}
                });

                this.emit("close", client);
            }
        });

        //if json message layer is active, it will turn this event into an id-reply message
        this.emit("message", clientId, JSON.stringify({
            type: "internal",
            header: "CONNECTED",
            content: {}
        }));

        this.emit("connection", client);
    }

    _getClientForId(clientId){

        if(typeof clientId !== "string"){

            this.log("cannot get a client for a clientId that is null or not a string -> " + clientId);

            return {
                client: null,
                index: -1
            };
        }
        
        for(let i = 0; i < this.clients.length; i++){
            if(this.clients[i].clientId === clientId){    
                return {
                    client: this.clients[i],
                    index: i
                };
            }
        }

        return {
            client: null,
            index: -1
        };
    }

    _removeClientForId(clientId){

        const {client, index} = this._getClientForId(clientId);

        if(client){
            this.clients.splice(index, 1);
            this.log("removed client " + clientId);
            return true;
        }

        this.log("failed to remove client: " + clientId);
        return false;
    }

    _onMessageOut(message){

        const length = message.length;

        try {
            message = JSON.parse(message);
            if(!message){
                return this.debug("message is empty.");
            }
        } catch(e){
            this.debug("failed to parse message: " + e.message);
            return;
        }

        if(message.originId === this.originId){
            return;
        }

        this.debug("received new message-out => " + length + " for client " + message.clientId);
        this._send(message.clientId, message.message, () => {}); //fire & forget
    }

    _onMessageGlobal(message){

        const length = message.length;

        try {
            message = JSON.parse(message);
            if(!message){
                throw new Error("message is empty.");
            }
        } catch(e){
            this.debug("failed to parse message: " + e.message);
            return;
        }

        if(!message.toSelf && message.originId === this.originId){
            this.debug("ignoring global message to self.");
            return;
        }

        this.debug("received new message-global => " + length + " from server " + message.originId + " of type: " + message.type);

        switch(message.type){

            case "broadcast":
                this.broadcast(message.message);
            break;

            default: this.emit("global", message.type, message.message); break;
        }
    }

    _getStandaloneRedisClient(){

        if(this._redisClient){
            return this._redisClient;
        }

        this.log("creating standalone redis client, as it did not exist before.");
        this._redisClient = new Redis(this._redisConf);
        return this._redisClient;
    }

}

module.exports = Server;