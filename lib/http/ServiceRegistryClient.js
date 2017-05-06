"use strict";

const request = require("request");
const Promise = require("bluebird");

const REGISTER_INTERVAL = 10000 / 2;

class ServiceRegistryClient {

    constructor({protocol, host, port, authorization}){

        this.protocol = protocol || "http";
        this.host = host;
        this.port = port;
        this._authorization = authorization;
        this._intv = null;
    }

    _getBaseUrl(){
        return this.protocol + "://" + this.host + ":" + this.port + "/api";
    }

    runAutoRegister(name, zone, ip, port){
        this._intv = setInterval(() => {
            this.register(name, zone, ip, port);
        }, REGISTER_INTERVAL);
    }

    close(){
        if(this._intv){
            clearInterval(this._intv);
        }
    }

    register(name, zone, host, ports){

        const packet = {
            name,
            zone,
            host,
            ports
        };

        return new Promise((resolve, reject) => {
            request({
                method: "POST",
                url: this._getBaseUrl() + "/register",
                headers: {
                    authorization: this._authorization,
                    "content-type": "application/json"
                },
                body: JSON.stringify(packet)
            }, (error, response, body) => {

                if(error){
                    return reject(error.message);
                }

                if(response.statusCode !== 201){
                    return reject(body);
                }

                resolve(body);
            });
        });
    }

    list(zone = "*"){
        return new Promise((resolve, reject) => {
            request({
                method: "GET",
                url: this._getBaseUrl() + "/list/" + zone
            }, (error, response, body) => {

                if(error){
                    return reject(error.message);
                }

                if(response.statusCode !== 200){
                    return reject(body);
                }

                resolve(JSON.parse(body));
            });
        });
    }
}

module.exports = ServiceRegistryClient;