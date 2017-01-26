const UdpWS = require("udpws");

class Proxy {

    constructor({servers, config, log}){

        this._mode = config.mode || "udp4";
        this.proxies = [];
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

    run(){
        return new Promise(resolve => {

            this.log(`starting udp proxy server in mode ${this._mode} with ${this.proxies.length} upstreams.`);
            resolve(true);
        });
    }
}

module.exports = Proxy;