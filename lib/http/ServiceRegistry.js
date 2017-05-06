"use strict";

const express = require("express");
const Promise = require("bluebird");
const Redis = require("ioredis");
const bodyParser = require("body-parser");

const SERVICE_TTL = 10000;
const SERVICE_PREFIX = "service:registry:";

class ServiceRegistry {

    constructor({port, redisConfig, authorization}){

        this._port = port;
        this._app = null;
        this._server = null;
        this._redisConfig = redisConfig;
        this._authorization = authorization;
        this._redis = ServiceRegistry._getRedisSetup(redisConfig);

        this._init();
    }

    static _getRedisSetup(config){
        return new Redis(config);
    }

    _init(){
        this._app = express();
        this._app.use(bodyParser.json({}));

        this._app.post("/api/register", (req, res) => {

            if(req.headers.authorization !== this._authorization){
                return res.status(401).end("bad authorization.");
            }

            if(!req.body && typeof req.body !== "object"){
                return res.status(400).end("action requires a json object as http request body.");
            }

            if(!req.body.name || !req.body.zone || !req.body.host || !req.body.ports){
                return res.status(400).end("body should contain {name, zone, host, ports}.");
            }

            this._redis.set(SERVICE_PREFIX + req.body.name, JSON.stringify({
                name: req.body.name,
                zone: req.body.zone,
                host: req.body.host,
                ports: req.body.ports
            }), "EX", SERVICE_TTL, (error, _) => {

                if(error){
                    return res.status(500).end(error.message);
                }

                res.status(201).end("service entry made.");
            });
        });

        this._app.get("/api/list/:zone", (req, res) => {

            const zone = req.params.zone || "*";
            const key = this._redisConfig.keyPrefix + SERVICE_PREFIX + "*";

            this._redis.keys(key).then(keys => this._redis.mget(keys.map(k => k.split(this._redisConfig.keyPrefix)[1])))
                .then(values => res.status(200).json(values.map(v => JSON.parse(v)).filter(v => {
                    return zone === "*" || v.zone === zone;
                }))).catch(error => res.status(500).end(error.message));
        });
    }

    start(){
        return new Promise(resolve => {
            this._server = this._app.listen(this._port, resolve);
        });
    }

    close(){
        if(!this._server){
            this._server.close();
        }
    }
}

module.exports = ServiceRegistry;