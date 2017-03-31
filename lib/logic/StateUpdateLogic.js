"use strict";

const {State} = require("./../dto/index.js");
const INTERNAL = "internal";
const uuid = require("uuid");

class StateUpdateLogic {

    constructor(groupId, server, updatesViaUdp = true){

        this.groupId = groupId;
        this._server = server;

        this._state = null;
        this._intv = null;
        this._et = null;
        this.started = null;

        this.updatesViaUdp = updatesViaUdp;
        this.clientUidMap = {};
    }

    _getUdp(){

        if(!this._server || !this._server._udp){
            throw new Error(`state update logic for group ${this.groupId} running without server/udp-server.`);
        }

        return this._server._udp;
    }

    log(message){

        if(typeof message === "object"){
            message = JSON.stringify(message);
        }

        this._server.log("[StateUpdateLogic]: " + message);
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

        this._server.groupHandler.getGroupInstance(this.groupId).then(group => {

            if(!group){
                this.log("failed to get group during execution.");
                return;
            }

            group.list().then(clientIds => {

                if(!clientIds || clientIds.length <= 0){
                    this.log("clientids for group were empty");
                    return;
                }

                this.log(`sending identifiers to ${clientIds.length} as of start of SUL for ${this.groupId}.`);
                clientIds.forEach(clientId => this._generateAndSendIdentifierToClient(clientId));

            }).catch(e => this.log("failed to get client list from group."));
        }).catch(e => this.log("failed to get group: " + e))
    }

    _generateAndSendIdentifierToClient(clientId){

        const identifier = uuid.v4() + "-" + uuid.v4();
        this.clientUidMap[identifier] = clientId;

        this._server.send(clientId, INTERNAL, {
            created: Date.now(),
            identifier,
            groupId: this.groupId
        }, this._server.PACKET_HEADERS.MESSAGE_UPDATE).catch(e => {})
    }

    _sendToGroup(message){
        return this._server.broadcastToGroup(this.groupId, {
            type: INTERNAL,
            header: this._server.PACKET_HEADERS.MESSAGE_UPDATE,
            content: message
        });
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

    clientLeft(clientId){
        this.log(`match logic has to handle leaving client ${clientId} for group ${this.groupId}.`);
        //client has already been removed from this group in redis
        //other clients in match have already been notified via RGS:EXIT header

        this._state.removeClientFromState(clientId);
    }

    /**
     * this function will receive any update-message when
     * tcp update states are skipped (replaced) for udp updates
     * @param event
     * @param payload
     */
    handleUdpMessage(event, payload){

        //the most important part (before executing the message's content) is to identify
        //if the client is trustworthy

        //TODO next: store udo-client ids (matching tcp-client ids) in this state's space to idenitfy access rights

        switch(event){

            case "state":
                console.log(payload);
                break;

            case "message":
                break;

            case "world":
                break;

            default:
                this.log(`received unknown udp message event ${event}.`);
                break;
        }
    }

    static _hertzToMs(hertz){
        return 1000 / hertz;
    }

    _loop(){
        this._state.getStatesAsList().then(states => {

            if(!states){
                return;
            }

            const clientIds = states.map(state => state.clientId);

            if(!clientIds || clientIds.length <= 0){
                return;
            }

            //either send updates via udp server
            if(this.updatesViaUdp){
                this._getUdp().sendList(clientIds, { //TODO FIX this will never work, because udp clients have different clientIds
                    type: INTERNAL,
                    header: this._server.PACKET_HEADERS.STATE_UPDATE,
                    content: {
                        created: Date.now(),
                        states
                    }
                });
                return;
            }

            //or if disabled, send updates via tcp server
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