"use strict";

const {State} = require("./../dto/index.js");
const INTERNAL = "internal";

class StateUpdateLogic {

    constructor(groupId, server){
        this.groupId = groupId;
        this._server = server;

        this._state = null;
        this._intv = null;
    }

    log(message){
        this._server.log(message);
    }

    execute(hertz = 24){

        if(this._intv){
            throw new Error("state update logic interval already active.");
        }

        this.log(`running match-state logic for group ${this.groupId} @ ${hertz} hertz.`);

        this._state = new State(this._server._redis, this.groupId);
        this._intv = setInterval(this._loop.bind(this), StateUpdateLogic._hertzToMs(hertz));
    }

    end(){

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
                message: {
                    created: Date.now(),
                    states
                }
            });
        });
    }
}

module.exports = StateUpdateLogic;