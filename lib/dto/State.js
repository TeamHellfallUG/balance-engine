"use strict";

const avro = require("avsc");
const Promise = require("bluebird");

const StatePrototype = {
    name: "State",
    type: "record",
    fields: [
        {
            name: "position",
            type: {
                name: "Position",
                type: "record",
                fields: [
                    {name: "x", type: "float"},
                    {name: "y", type: "float"},
                    {name: "z", type: "float"}
                ]
            }
        },
        {
            name: "rotation",
            type: {
                name: "Rotation",
                type: "record",
                fields: [
                    {name: "x", type: "float"},
                    {name: "y", type: "float"},
                    {name: "z", type: "float"}
                ]
            }
        },
        {
            name: "animations",
            type: {
                type: "array",
                items: "string"
            }
        }
    ]
};

const StateType = avro.parse(StatePrototype);
const DEFAULT_EXPIRE_TIMEOUT = 60 * 60 * 6; // 6 hours
const SP = "sp:";

class State {

    constructor(redis, groupId){

        if(!groupId){
            throw new Error("cannot init State without groupId.");
        }

        this.redis = redis;
        this.key = SP + groupId;
    }

    static isValid(obj){
        return StateType.isValid(obj);
    }

    static serialise(obj){
        return StateType.toBuffer(obj);
    }

    static deserialise(buffer){
        return StateType.fromBuffer(buffer);
    }

    expire(){
        return this.redis.expire(this.key, DEFAULT_EXPIRE_TIMEOUT);
    }

    updateState(clientId, state){

        //ease
        if(typeof state === "object"){

            if(!state.animations){
                state.animations = [];
            }

        }

        if(!State.isValid(state)){
            return Promise.reject(new Error(`${clientId} send invalid state object -> ${typeof state}: ${JSON.stringify(state)}.`));
        }

        return this.redis.hset(this.key, clientId, State.serialise(state));
    }

    getStatesAsList(){
        return this.redis.hgetallBuffer(this.key).then(hset => {

            if(!hset){
                return [];
            }

            return Object.keys(hset).map(key => {
                try {
                    const o = State.deserialise(hset[key]);
                    o.clientId = key;
                    return o;
                } catch(e) {
                    console.log(e);
                    return null;
                }
            }).filter(v => !!v);
        });
    }

    removeClientFromState(clientId){
        return this.redis.hdel(this.key, clientId);
    }

    erase(){
        return this.redis.del(this.key);
    }

}

module.exports = {State, StateType};