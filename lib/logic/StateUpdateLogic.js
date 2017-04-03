"use strict";

const uuid = require("uuid");

const {State} = require("./../dto/index.js");
const {vector} = require("./../tools/index.js");

const INTERNAL = "internal";

class StateUpdateLogic {

    constructor(groupId, server, options = {}){

        const {updatesViaUdp,
            calculateStateDistance,
            maxStateDistanceSec} = options;

        this.groupId = groupId;
        this._server = server;

        this._state = null;
        this._intv = null;
        this._et = null;
        this.started = null;

        this.updatesViaUdp = typeof updatesViaUdp === "undefined" ?
            true :
            updatesViaUdp;

        this.clientUidMap = {};
        this.validatedUidMap = {};
        this.udpClientList = [];

        this.states = {};

        this.calculateStateDistance = typeof calculateStateDistance === "undefined" ?
            true :
            calculateStateDistance;

        this.maxStateDistanceSec = typeof maxStateDistanceSec === "undefined" ?
            50 :
            maxStateDistanceSec;
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

    _validateClientIdentifier(identifier, clientId){

        if(!this.clientUidMap){
            return false;
        }

        if(typeof identifier !== "string" ||
            typeof clientId !== "string"){
            return false;
        }

        if(!this.clientUidMap[identifier] ||
            this.clientUidMap[identifier] !== clientId){
            return false;
        }

        return true;
    }

    _checkFirstClientIdentifierValidation(identifier, tcpClientId, udpClientId){

        if(this.validatedUidMap[identifier]){
            return false;
        }

        this.log(`first udp validation of tcp client ${tcpClientId} as udp client ${udpClientId}.`);

        this.validatedUidMap[identifier] = {
            tcp: tcpClientId,
            udp: udpClientId
        };

        const total = Object.keys(this.clientUidMap).length;
        const validated = Object.keys(this.validatedUidMap).length;

        if(validated >= total){
            this.log(`every client (${validated}) in group ${this.groupId} has validated its udp client.`);

            this._sendToGroup({
                info: "VALIDATION-TOTAL",
                groupId: this.groupId
            });

            this.udpClientList = Object.keys(this.validatedUidMap).map(k => this.validatedUidMap[k].udp);
        }

        return true;
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

    _handleNewStoredState(clientId, state){

        state.received = Date.now();

        if(!this.calculateStateDistance){
            this.states[clientId] = state;
            return;
        }

        const oldState = this.states[clientId];
        this.states[clientId] = state; //valid dto/State.js object

        if(!oldState){
            return;
        }

        try {

            const timelyDistanceMs = state.received - oldState.received;

            if (timelyDistanceMs <= 0) {
                return;
            }

            let distance = vector.getDistanceLength(state.position, oldState.position);
            if (distance < 0) {
                distance *= -1;
            }

            const distanceAchieved = (distance / timelyDistanceMs) * 1000; //distance per second

            if (distanceAchieved > this.maxStateDistanceSec) {
                this.log(`client ${clientId} traveled further than max-distance per sec: ${distanceAchieved}, by ${distance} d in ${timelyDistanceMs} ms.`);
                //TODO punish client here?
            }

        } catch(e){
            //empty
        }
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

        //payload {}
        // tid -> tcp-client uuid
        // gid -> group id of tcp-client (this.groupId)
        // uid -> unique id that has been sent via tcp client (this._generateAndSendIdentifierToClient)
        // udpId -> udp-client uuid

        const valid = this._validateClientIdentifier(payload.uid, payload.tid);

        if(!valid){
            this.log(`invalid udp message for tcp-id: ${payload.tid} coming from udp-client: ${payload.udpId}.`);
            return; //TODO close connection of this udp client (udpws con)
        }

        this._checkFirstClientIdentifierValidation(payload.uid, payload.tid, payload.udpId);

        switch(event){

            case "state":
                this._state.updateState(payload.tid, payload.state).then(_ => {
                    this._handleNewStoredState(payload.tid, payload.state);
                }, e => {
                    this.log(`failed to update client's ${payload.tid} state. err: ${e.message}.`);
                });
                break;

            case "message":
                //TODO implement
                break;

            case "world":
                //TODO implement
                break;

            case "any":
                //empty
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
        //TODO stop/skip this if no clients are actively connected
        this._state.getStatesAsList().then(states => {

            if(!states){
                return;
            }

            //either send updates via udp server
            if(this.updatesViaUdp && this.udpClientList.length > 0){
                this._getUdp().sendList(this.udpClientList, {
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

            const clientIds = states.map(state => state.clientId);

            if(!clientIds || clientIds.length <= 0){
                return;
            }

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