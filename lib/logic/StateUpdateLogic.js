"use strict";

const {State} = require("./../dto/index.js");
const INTERNAL = "internal";

class StateUpdateLogic {

    constructor(groupId, server){
        this.groupId = groupId;
        this._server = server;

        this._state = null;
        this._intv = null;
        this._et = null;
        this.started = null;
    }

    log(message){
        this._server.log(message);
    }

    execute(hertz, durationMs){

        if(this._intv){
            throw new Error("state update logic interval already active.");
        }

        this.log(`running match-state logic for group ${this.groupId} @ ${hertz} hertz, for ${durationMs/1000} seconds.`);

        this._state = new State(this._server._redis, this.groupId);
        this._intv = setInterval(this._loop.bind(this), StateUpdateLogic._hertzToMs(hertz));
        this._et = setTimeout(() => {
            this._server.endMatch(this.groupId); //emits server event, that will clean-up starting form rgs
        }, durationMs);
    }

    end(){

        if(this._et){
            clearTimeout(this._et); //probably useless
        }

        if(!this._intv){
            throw new Error("state update logic interval never ran.");
        }

        this.log(`ending match-state logic for group ${this.groupId}.`);
        clearInterval(this._intv);
    }

    static _hertzToMs(hertz){
        return 1000 / hertz;
    }

    _loop(){
        this._state.getStatesAsList().then(states => {
            const clientIds = states.map(state => state.clientId);
            this._server.sendList(clientIds, {
                type: INTERNAL,
                header: this._server.PACKET_HEADERS.STATE_UPDATE,
                content: {
                    created: Date.now(),
                    states
                }
            });
        });
    }
}

module.exports = StateUpdateLogic;