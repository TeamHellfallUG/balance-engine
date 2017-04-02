"use strict";

const EventEmitter = require("events");
const udpws = require("udpws");

const INTERNAL = "internal";

class UDPTest extends EventEmitter {

    constructor(config){
        super();
        this.udp = new udpws(config);
        this.udpPingIntv = null;
        this.attachListeners();
        this.firstPong = false;
    }

    log(msg){
        console.log(msg);
    }

    attachListeners(){

        this.udp.on("error", error => {
            console.log("client error " + error.message);
        });

        this.udp.on("close", () => {
            console.log("client closing.");
        });

        this.udp.on("message", message => {

            message = JSON.parse(message);

            if(message.type === INTERNAL){

                switch(message.header){
                    case "UDP:CONN": this.sendUdpPacket("UDP:CONN"); return;
                    case "UDP:CONN:AFIRM": this.log("udp con affirmed"); return;
                    case "UDP:PING":
                        if(!this.firstPong){
                            this.log("first pong received.");
                            this.firstPong = true;
                            this.emit("ready", true);
                        }
                        return;
                }
            }

            //this.log("client message: " + message);
            this.emit("message", message);
        });

        this.udpPingIntv = setInterval(() => {
            this.sendUdpPacket("UDP:PING", "ping");
        }, 500);

        this.udp.on("open", (address, port) => {
            this.log(`client ready and listening ${address}:${port}.`);
            this.sendUdpPacket("UDP:CONN");
        });
    }

    sendUdpPacket(header = "UDP:PING", content = {}, type = "internal"){
        if(this.udp){
            this.udp.send(JSON.stringify({
                header,
                content,
                type
            }), e => {
                if(e){
                    this.log(`error during udp client send: ${e}.`);
                }
            });
        }
    }

    close(){

        if(this.udpPingIntv){
            clearInterval(this.udpPingIntv);
        }

        if(this.udp){
            this.udp.close();
        }
    }

}

module.exports = UDPTest;