const http = require("https");
const fs = require("fs");
const HttpProxy = require("http-proxy");
const request = require("request");

http.globalAgent.maxSockets = 10240;

const FAILOVER_INTERVAL = 10000;

class Proxy {

    constructor({servers, config}){

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
    }

    run(){
        return new Promise(resolve => {

            this.server = http.createServer(this.sslOpts, this._onRequest.bind(this));

            this.server.on("upgrade", (req, socket, head) => {
                const proxyIndex = this._getRandomServer();
                const proxy = this.proxies[proxyIndex];
                proxy.ws(req, socket, head);

                proxy.on("error",(err, req, socket) => {
                    socket.end();
                    this._startFailoverTimer(proxyIndex);
                });
            });

            this.server.listen(this.config.port, () => {
                resolve(true);
            });
        });
    }

    _getRandomServer(){

        const index = Math.floor(Math.random() * this.proxies.length);

        if(!this.proxies[index].options.down){
            return index;
        }

        return 0; //TODO get upstream that is not down
    }

    _onRequest(req, res){
        const proxyIndex = this._getRandomServer();
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

        this.failoverTimer[index] = setTimeout(() => {

            request({
                url: "http://" + this.proxies[index].options.target.host + ":" + this.proxies[index].options.target.port,
                method: "HEAD",
                timeout: 10000
            }, (err, res, body) => {

                this.failoverTimer[index] = null;

                if (res && res.statusCode === 200) {
                    this.proxies[index].options.down = false;
                    console.log("Server #" + index + " is back up.");
                } else {
                    this.proxies[index].options.down = true;
                    this._startFailoverTimer(index);
                    console.log("Server #" + index + " is still down.");
                }
            });

        }, FAILOVER_INTERVAL);
    }
}

module.exports = Proxy;