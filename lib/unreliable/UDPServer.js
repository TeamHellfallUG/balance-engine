"use strict";

const udpws = require("udpws").Server;

const INTERNAL = "internal";
const NOOP = () => {};

class UDPServer {

    constructor({host, port, debug}, parent){

        this._debug = debug;
        this._parent = parent;

        this._options = {
            host,
            port,
            family: "udp4"
        };

        this.server = null;
    }

    log(message){

        if(typeof message !== "string"){
            message = JSON.stringify(message);
        }

        this._parent.log("[udp] " + message);
    }

    debug(message){
        if(this._debug){
            this.log(message);
        }
    }

    run(){

        this.server = new udpws(this._options);

        this.server.on("error", error => {
            this.log("server error " + error.message);
        });

        this.server.on("close", () => {
            this.log("server closing.");
        });

        this.server.on("connection", connection => {

            this.log(`new connection from ${connection.address}:${connection.port}.`);

            connection.on("message", message => {

                this.debug("new message from connection: " + message);

                let jmessage = null;
                try {
                    jmessage = JSON.parse(message);
                    if(!jmessage){
                        throw new Error("empty message");
                    }
                } catch(e){
                    this.log(`failed to parse incoming message: ${e.message}.`);
                    return;
                }

                if(jmessage.type === INTERNAL){
                    switch(jmessage.header){

                        case "UDP:CONN":
                        case "UDP:PING":
                            connection.send(message, NOOP);
                            break;

                        default:
                            this.log(`received unknown internal message ${message.header}.`);
                            break;
                    }
                    return;
                }

                //TODO emit packet here
            });

            connection.on("close", () => {
                this.log("connection closed.");
            });
        });

        this.server.on("listening", (address, port) => {
            this.log(`server listening ${address}:${port}.`);
        });
    }

}

module.exports = UDPServer;