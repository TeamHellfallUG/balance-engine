const EventEmitter = require("events");

const WebSocketServer = require("uws").Server;
const Redis = require("ioredis");
const uuid = require("uuid");

const WSS_MESSAGES_TOPIC_OUT = "wss:messages:topic:out";
const WSS_MESSAGES_TOPIC_GLOBAL = "wss:messages:topic:global";

class Server extends EventEmitter {

    constructor({port, redis, log}){
        super();

        this.wss = new WebSocketServer({
            port
        });

        this.originId = uuid.v4();
        this.clients = [];

        //outgoing socket messages
        this.redisPubOut = new Redis(redis);
        this.redisSubOut = new Redis(redis);

        //global server messages
        this.redisPubGlobal = new Redis(redis);
        this.redisSubGlobal = new Redis(redis);

        this._log = log;
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

    _send(clientId, message, callback){

        const {client} = this._getClientForId(clientId);

        if(!client){
            this.log("client " + clientId + " does not exist on this server.");
            return callback("NOT_EXIST");
        }

        if(typeof message !== "string"){
            message = JSON.stringify(message);
        }

        client.socket.send(message, (err, result) => {

            if(err){
                this.log("failed to send message to client " + clientId + " because: " + err.message);
                return callback(err);
            }

            this.log("message sent to client " + clientId);
            callback(null, result);
        });
    }

    send(clientId, message){
        return new Promise((resolve, reject) => {

            this.log("trying to send message to " + clientId);

            this._send(clientId, message, err => {

                if(err && err !== "NOT_EXIST"){
                    return reject(err);
                }

                if(!err){
                    return resolve(1);
                }

                //socket is not opened on this server
                //call the others

                this._publishOut({
                    clientId,
                    originId: this.originId,
                    message
                });
                resolve(2);
            });
        });
    }

    /**
     * broadcasts to all clients with their socket connected to this server
     */
    broadcast(message){
        this.log("trying to broadcast message.");
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
        this.log("trying to globally broadcast message.");
        this._publishGlobal("broadcast", message, true);
    }

    _publishOut(message){

        if(!message){
            return false;
        }

        if(typeof message !== "string"){
            message = JSON.stringify(message);
        }

        this.redisPubOut.publish(WSS_MESSAGES_TOPIC_OUT, message);
        this.log("message-out published => " + message.length);
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
        this.log("message-global published => " + message.length);
        return true;
    }

    _onConnection(socket){

        const clientId = uuid.v4();
        this.log("new socket tagged as client: " + clientId);

        const client = {
            clientId,
            socket,
            created: Date.now()
        };

        this.clients.push(client);

        socket.on("message", message => {
            const length = message.length;
            this.log("received new message-in => " + length + " from client " + clientId);

            /**
             * listen via server.on("message", clientId, message){}
             */
            this.emit("message", clientId, message);
        });

        socket.on("close", () => {
            this.log("client " + clientId + " closed the connection.");
            if(this._removeClientForId(clientId)){
                this.emit("close", client);
            }
        });

        this.emit("connection", client);
    }

    _getClientForId(clientId){
        
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
                return this.log("message is empty.");
            }
        } catch(e){
            this.log("failed to parse message: " + e.message);
            return;
        }

        if(message.originId === this.originId){
            return;
        }

        this.log("received new message-out => " + length + " for client " + message.clientId);
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
            this.log("failed to parse message: " + e.message);
            return;
        }

        if(!message.toSelf && message.originId === this.originId){
            this.log("ignoring global message to self.");
            return;
        }

        this.log("received new message-global => " + length + " from server " + message.originId + " of type: " + message.type);

        switch(message.type){

            case "broadcast":
                this.broadcast(message.message);
            break;

            default: this.emit("global", message.type, message.message); break;
        }
    }

    close(){

        this.log("closing server " + this.originId);

        this.wss.close();
        
        this.redisPubOut.quit();
        this.redisSubOut.quit();

        this.redisPubGlobal.quit();
        this.redisSubGlobal.quit();
    }

}

module.exports = Server;