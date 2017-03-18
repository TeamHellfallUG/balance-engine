"use strict";

const UDPCore  = require("./UDPCore.js");

const INTERNAL = "internal";
const NOOP = () => {};

class UDPServer extends UDPCore {

    constructor(options, parent){
        super(options);
        //const {host, port, redis, log, engine, debug} = options;
        this._parent = parent;
    }

    run(){
        super.log(`starting UDPServer[UDPCore] as child of ${this._parent.originId}.`);
        super.open().then(_ => {
            this.attachInternalListeners();
        });
    }

    send(clientId, header, content, type){
        return super.send(clientId, JSON.stringify({
            type,
            header,
            content
        }));
    }

    attachInternalListeners(){

        super.on("message", (clientId, message) => {

            super.debug("new message from connection: " + message);

            try {
                message = JSON.parse(message);
                if(!message){
                    throw new Error("empty message");
                }
            } catch(e){
                super.log(`failed to parse incoming message: ${e.message}.`);
                return;
            }

            if(message.type === INTERNAL){
                switch(message.header){

                    case "CONNECTED":
                        this.send(clientId, "UDP:CONN", "", INTERNAL).catch(NOOP);
                        return;

                    case "UDP:CONN":
                        this.send(clientId, "UDP:CONN:AFIRM", "", INTERNAL).catch(NOOP);
                        return;

                    case "UDP:PING":
                        message.content = "pong";
                        super.send(clientId, JSON.stringify(message)).catch(NOOP);
                        return;

                    default:
                        super.emit(INTERNAL, {
                            clientId,
                            header: message.header,
                            content: message.content
                        });
                        return;
                }
            }

            this.emit("jmessage", clientId, message);
        });
    }

}

module.exports = UDPServer;