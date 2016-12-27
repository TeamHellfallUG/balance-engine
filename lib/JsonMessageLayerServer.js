const Server = require("./Server.js");

const INTERNAL = "internal";

class JsonMessageLayerServer extends Server {

    constructor(config){
        super(config);
        this._attachMessageListener();
    }

    static getJMessage(type, content, _header){

        if(!type || !content){
            throw new Error("jmessage type or content are empty, cannot create message.");
        }

        if(typeof type !== "string"){
            throw new Error("jmessage type must be a string.");
        }

        if(type !== INTERNAL) {
            return {
                type,
                content
            };
        }

        if(typeof _header !== "string"){
            throw new Error("jmessage type 'internal' is reserved, please dont use it.");
        }

        return {
            type,
            header: _header,
            content
        };
    }

    static isValidMessage(message){

        if(!message || typeof message !== "object"){
            return false;
        }

        if(typeof message.type !== "string"){
            return false;
        }

        if(message.type === INTERNAL && typeof message.header !== "string"){
            //messages of type internal, must have a header present which determines their own type
            return false;
        }

        return typeof message.content !== "undefined";
    }

    _attachMessageListener(){

        super.log("jmessagelayer active.");

        super.on("message", (clientId, message) => {

            let msg = null;
            try {
                msg = JSON.parse(message);
                if(!JsonMessageLayerServer.isValidMessage(msg)){
                    return super.log("received invalid message from client " + clientId);
                }
            } catch(e){
                super.log("failed to parse message: " + e.message);
            }

            if(msg.type === INTERNAL){
                msg.clientId = clientId;
                super.emit(INTERNAL, msg);
            } else {
                super.emit("jmessage", clientId, msg);
            }
        });
    }

    send(clientId, type, content, _header){
        return super.send(clientId, JsonMessageLayerServer.getJMessage(type, content, _header));
    }

    /**
     * broadcasts to all clients with their socket connected to this server
     */
    broadcast(type, content, _header){
        return super.broadcast(JsonMessageLayerServer.getJMessage(type, content, _header));
    }

    /**
     * broadcasts to all client accross all servers
     */
    broadcastGlobal(type, content, _header){
        return super.broadcastGlobal(JsonMessageLayerServer.getJMessage(type, content, _header));
    }
}

module.exports = JsonMessageLayerServer;