"use strict";

const http = require("https");
const fs = require("fs");
const HttpProxy = require("http-proxy");
const request = require("request");

http.globalAgent.maxSockets = 10240;

const FAILOVER_INTERVAL = 10000;

const PROXY_MODES = {
    ROUND_ROBIN: "ROUND_ROBIN",
    RANDOM: "RANDOM"
};

class Proxy {

    constructor({servers, config, log}){

        this.config = config;

        /* example:
        const servers = [
            {host: "SERVER1-IP", port: 80},
            {host: "SERVER2-IP", port: 80},
            {host: "SERVER3-IP", port: 80}
        ]; */

        this.sslOpts = this.config.useSsl ? 
            this._readCertficate(this.config.opts) 
            : 
            undefined;

        this.proxies = servers.map((target) => 
            new HttpProxy.createProxyServer({
                target: target,
                ws: true,
                xfwd: true,
                ssl: this.sslOpts,
                down: false
            })
        );

        this.server = null;
        this.failoverTimer = [];
        this._mode = this.config.mode ? this.config.mode : PROXY_MODES.ROUND_ROBIN;
        this._roundRobinLastIndex = -1;

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

            this.log(`starting ws proxy server in mode ${this._mode} with ${this.proxies.length} upstreams.`);
            this.server = http.createServer(this.sslOpts, this._onRequest.bind(this));

            this.server.on("upgrade", (req, socket, head) => {
                const proxyIndex = this._getNextServer();
                const proxy = this.proxies[proxyIndex];
                proxy.ws(req, socket, head);

                proxy.on("error",(err, req, socket) => {
                    socket.end();
                    this._startFailoverTimer(proxyIndex);
                });
            });

            this.server.listen(this.config.port, () => {
                this.log("proxy listening at http://%h:"+ this.config.port);
                resolve(true);
            });
        });
    }

    _getNextServer(){

        let index = 0;
        switch(this._mode){

            case PROXY_MODES.RANDOM:
                index = this._getRandomServer();
                break;

            case PROXY_MODES.ROUND_ROBIN:
            default:
                index = this._getRoundRobinServer();
                break;
        }

        return index;
    }

    _getRoundRobinServer(){

        let index = this._roundRobinLastIndex;
        let cycles = 0;

        while(true){

            index++;

            if(this.proxies.length <= index){
                index = 0;
            }

            //looks like all proxies are down
            if(cycles >= this.proxies.length){
                this._roundRobinLastIndex = index;
                return index;
            }

            if(!this.proxies[index].options.down){
                this._roundRobinLastIndex = index;
                return index;
            }

            cycles++;
        }

    }

    _getRandomServer(){

        const index = Math.floor(Math.random() * this.proxies.length);

        if(!this.proxies[index].options.down){
            return index;
        }

        return 0; //TODO get upstream that is not down
    }

    _onRequest(req, res){
        const proxyIndex = this._getNextServer();
        const proxy = this.proxies[proxyIndex];
        proxy.web(req, res);

        proxy.on('error', (err) => {
            this._startFailoverTimer(proxyIndex);
        });
    }

    _readCertficate(opts){

        /* example:
        const opts = {
            ca: [ "./certs/PositiveSSLCA2.crt", "./certs/AddTrustExternalCARoot.crt" ],
            key: "./certs/example_wild.key",
            cert: "./certs/STAR_example_com.crt"
        }; */

        return {
            ca: opts.ca.map(file => fs.readFileSync(file)),
            key: fs.readFileSync(opts.key),
            cert: fs.readFileSync(opts.cert)
        };
    }

    _startFailoverTimer(index){

        if (this.failoverTimer[index]) {
            return;
        }

        this.proxies[index].options.down = true;
        this.log("server #" + index + " seems to be down, checking alive status.");

        this.failoverTimer[index] = setTimeout(() => {

            request({
                url: "http://" + this.proxies[index].options.target.host + ":" + this.proxies[index].options.target.port,
                method: "HEAD",
                timeout: 10000
            }, (err, res, body) => {

                this.failoverTimer[index] = null;

                if (res && res.statusCode === 200) {
                    this.proxies[index].options.down = false;
                    this.log("server #" + index + " is back up.");
                } else {
                    this.proxies[index].options.down = true;
                    this._startFailoverTimer(index);
                    this.log("server #" + index + " is still down.");
                }
            });

        }, FAILOVER_INTERVAL);
    }
}

module.exports = Proxy;