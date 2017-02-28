"use strict";

const Merkury = require("merkury");

const GroupServer = require("./GroupServer.js");
const {MatchMakingConfirmation, State} = require("./dto/index.js");
const {StateUpdateLogic} = require("./logic/index.js");

const {reflect} = require("./tools/index.js");

const INTERNAL = "internal";
const PREFIX = "RGS:";
const NOTIFY = ":NOTIFY";

const IMSG = {

    //match making related
    BROADCAST: PREFIX + "BROADCAST",
    SEARCH: PREFIX + "SEARCH",
    LEAVE: PREFIX + "LEAVE",
    CONFIRM: PREFIX + "CONFIRM",

    DISBAND: PREFIX + "DISBAND", //emitted by server only
    START: PREFIX + "START", //emitted by server only
    END: PREFIX + "END", //emtted by server only
    EXIT: PREFIX + "EXIT",

    //client state related
    STATE_UPDATE: PREFIX + "STATE",
    MESSAGE_UPDATE: PREFIX + "MESSAGE",
    WORLD_UPDATE: PREFIX + "WORLD"
};

const INTERNAL_INTERVAL_MS = 3200;
const MAX_MMC_LIFETIME_MS = 1000 * 60 * 2; //2 minutes
const DEFAULT_MERKURY_TOPIC = "default-balance-engine";

class RoomGroupServer extends GroupServer {

    constructor(config){
        super(config, false);

        this._redis = null;
        this.lobbySize = config.lobbySize || 3;

        this._config = config;

        this.sulHertz = config.sulHertz || 24;
        this.sulDuration = config.sulDuration || 60 * 1000 * 10; // 10 minutes

        this._queueGroupId = null;
        this._t = null;

        this._mk = null;
        this._confirmations = {};
        this._logics = {};

        this.PACKET_HEADERS = IMSG;
        this._attachInternalRoomListener();
    }

    open(){
        return super.open().then(_ => {
            this._redis = super._getStandaloneRedisClient();
            return super.__createGroupWithoutClient().then(groupId => {

                this._queueGroupId = groupId;
                super.log("created group " + groupId + " for queue.");

                this._mk = new Merkury(
                    this._config.merkuryTopic || DEFAULT_MERKURY_TOPIC,
                    this._config.redis
                );

                return this._mk.connect().then(_ => {
                    //await merkury connections
                    this._attachMerkuryListeners();
                    return this._mk.healthCheck().then(result => {
                        super.log(`merkury hc result: ${result}.`);
                        return true;
                    });
                });
            });
        });
    }

    /**
     * run this on a single instance only and only if you do not call
     * executeMatchMakingLogic manually
     */
    runAutoMatchmaking(){
        //currently this action is only supported by a single instance
        //meaning that if _runInternalInterval() should only be called once per queue
        //otherwise various anomalies relating group join & leave actions could appear
        this._runInternalInterval();
    }

    _attachInternalRoomListener(){

        super.log("room group layer active.");

        super.on(INTERNAL, ({clientId, header, content}) => {

            switch(header){

                case IMSG.SEARCH:
                    this.__search(clientId, content, header);
                break;

                case IMSG.LEAVE:
                    this.__leave(clientId, content, header);
                break;

                case IMSG.BROADCAST:
                    this.__broadcastUpdate(clientId, content, header);
                break;

                case IMSG.CONFIRM:
                    this.__handleConfirm(clientId, content, header);
                break;

                case IMSG.EXIT:
                    this.__handleExit(clientId, content, header);
                break;

                case IMSG.STATE_UPDATE:
                    this.__handleUpdateState(clientId, content, header);
                break;

                case IMSG.MESSAGE_UPDATE:
                    this.__handleUpdateMessage(clientId, content, header);
                break;

                case IMSG.WORLD_UPDATE:
                    this.__handleUpdateWorld(clientId, content, header);
                break;

                case "CLOSE":
                    this.__handleClose(clientId);
                break;

                default: return; //ignore
            }
        });
    }

    _attachMerkuryListeners(){

        /* ### handle instance wide events ### */

        this._mk.on("match-started", groupId => {
            super.log(`received "match-started" event for group: ${groupId}`);

            const logic = new StateUpdateLogic(groupId, this);
            this._logics[groupId] = logic;
            logic.execute(this.sulHertz, this.sulDuration);

        }, true); //race

        this._mk.on("match-ended", groupId => {
            super.log(`received "match-ended" event for group: ${groupId}`);

            if(this._logics[groupId]){
                //call sul instance and inform
                this._logics[groupId].end();
                delete this._logics[groupId];
            }
        }); //no race

        this._mk.on("match-exited", (groupId, clientId) => {
            super.log(`received "match-exited" event for group: ${groupId}`);

            if(this._logics[groupId]){
                this._logics[groupId].clientLeft(clientId);
            }
        }); //no race

        /* ### listen for internal events and publish them instance wide ### */

        super.on("match", (event, groupId, clientId) => {

            //listen for starting matches
            if(event === "started"){
                //and emit instance wide race-event "match-started"
                this._mk.emit("match-started", groupId);
            }

            //listen for ending matches (called by sul)
            if(event === "ended"){
                //and emit instance wide non-race-event "match-ended"
                this._mk.emit("match-ended", groupId);
            }

            //listen for leaving or closing clients
            if(event === "exited"){
                //and emit instance wide non-race-event "match-exited"
                this._mk.emit("match-exited", groupId, clientId);
            }
        });
    }

    endMatch(groupId){
        super.emit("match", "ended", groupId);
    }

    _runInternalInterval(){

        if(this._t){
            throw new Error("internal interval is already active.");
        }

        super.log("interal match-making interval is active.");

        this._t = setInterval(() => {

            (new Promise(resolve => {
                this._executeMatchMakingLogic(true).then(_ => {
                    //empty
                    setTimeout(resolve, 10);
                }, e => {
                    super.log(`match making logic execution failed with an error: ${e.message} and stack: ${e.stack}.`);
                    setTimeout(resolve, 10);
                });
            })).then(_ => {
                //has to be executed afterwards to ensure best efficiency
                this._executeMatchConfirmationLogic(true).then(_ => {
                    //empty
                }, e => {
                    super.log(`match making confirmation logic execution failed 
                    with an error: ${e.message} and stack: ${e.stack}.`);
                });
            });

        }, INTERNAL_INTERVAL_MS);
    }

    /**
     * run mm logic manually, if interval is not active
     * @returns {*}
     */
    executeMatchMakingLogic(){
        return this._executeMatchMakingLogic();
    }

    _executeMatchMakingLogic(intern = false){

        if(!intern && this._t){
            return Promise.reject("cannot execute mm logic manually, when interval is active.");
        }

        super.log("running match-making logic..");
        const startT = Date.now();

        return this._getQueueGroup().then(group => {
            return group.list().then(clientIds => {

                if(!clientIds || clientIds.length < this.lobbySize){
                    return;
                }

                //since there are enough clients in the queue

                super.log(`${clientIds.length} clients in match making queue.`);

                let groupIndex = 0;
                const clientGroups = [];
                clientIds.forEach(clientId => {

                    if(!clientGroups[groupIndex]){
                        clientGroups[groupIndex] = [];
                    }

                    if(clientGroups[groupIndex].length < this.lobbySize){
                        clientGroups[groupIndex].push(clientId);
                        return;
                    }

                    groupIndex++;
                    clientGroups[groupIndex] = [clientId];
                });

                //clients are now separated into multiple arrays with the lobbysize

                super.log(`${clientGroups.length - 1} groups will be created from match making queue.`);

                const newGroups = [];
                const newGroupsPromises = [];

                const self = this;
                function closure(cList){
                    newGroupsPromises.push(reflect(group.removeMulti(cList).then(_ => {
                        return self.groupHandler.createGroupInstance().then(newGroup => {
                            newGroups.push(newGroup); //store the new group
                            return newGroup.pushMulti(cList); //but also push all clients into group
                        });
                    })));
                }

                clientGroups.forEach(cList => {

                    if(cList.length < this.lobbySize){
                        return; //skip groups that have not been fully filled (last one probably)
                    }

                    closure(cList);
                });

                //await the removal and multiPush of all groups
                return Promise.all(newGroupsPromises).then(_r => {

                    super.log(`${_r.length} groups were processed and ${newGroups.length} were created from match making queue.`);
                    _r.map(refl => !!refl ? refl.e : refl).filter(v => !!v).forEach(e => super.log(`mm group interactions failed: ${e.message} stack: ${e.stack}`));
                    newGroups.forEach(g => this._onFreshlyMatchedGroup(g)); //call handler to initiate match

                    super.log(`match making logic has been executed, took: ${(Date.now() - startT)} ms.`);
                    return true; //eofmm
                });
            });
        });
    }

    /**
     * run mm confirmation logic manually, if interval is not active
     */
    executeMatchConfirmationLogic(){
        return this._executeMatchConfirmationLogic();
    }

    _executeMatchConfirmationLogic(intern = false){

        if(!intern && this._t){
            return Promise.reject("cannot execute mm confirmation logic manually, when interval is active.");
        }

        super.log("running match-making confirmation logic..");
        const startT = Date.now();

        //using _confirmations to run along the data stored in redis
        //this data is not available locally but in redis because the confirmation handle might
        //have been done by other server instances

        const self = this;
        const promList = [];
        function closure(groupId){

            const mmc = new MatchMakingConfirmation(self._redis, groupId);
            //a clientId can only be pushed once into the mmc
            //and a clientId can only be pushed into the mmc if it is a member of the matched group
            //meaning, all we need to know is the size of mmc

            if((Date.now() - self._confirmations[groupId].opened) >= MAX_MMC_LIFETIME_MS){
                //mmc has timed out (in redis probably as well by now)
                //remove this entry from our confirmations object
                //clean-up redis (mmc + group)
                //and send a message to the clients in the group
                self.log(`in-confirmation-match ${groupId} has timed-out sending disband.`);

                delete self._confirmations[groupId];
                mmc.erase().then(_ => {}, e => {});

                self.broadcastToGroup(groupId, {
                    type: INTERNAL,
                    header: IMSG.DISBAND,
                    content: {
                        mm: "MATCH-DISBAND-TIMEOUT",
                        matchId: groupId
                    }
                });

                //await broadcast -> then delete group from redis
                const tp = new Promise(resolve => {
                    setTimeout(() => {
                        self.groupHandler.getGroupInstanceNoCalls(groupId).then(group => {
                            group.erase();
                        }).catch(e => {});
                        resolve();
                    }, 250);
                });

                self.emit("match", "disbanded", groupId);
                promList.push(tp);
                return;
            }

            //if this block is reached for the current match
            //it means that its still running inside of the 2 minutes confirmation await
            //block

            promList.push(reflect(mmc.size().then(size => {

                //no size = no key = no confirmations yet
                if(!size){
                    self.log(`in-confirmation-match ${groupId} has no confirmations yet.`);
                    return Promise.resolve("nothing confirmed yet.");
                }

                if(size < self.lobbySize){
                    self.log(`in-confirmation-match ${groupId} has reached ${size}/${self.lobbySize} confirmations
                        awaiting more confirmations.`);
                    return Promise.resolve("awaiting more confirmations.");
                }

                self.log(`in-confirmation-match ${groupId} has reached lobbySize ${self.lobbySize} - initiating match.`);
                //alright, all clients confirmed
                //we want to clean-up redis (mmc) and the internal state (confirmations)
                //and tell all clients that the match is ready to start

                delete self._confirmations[groupId];
                mmc.erase().then(_ => {}, e => {});

                self.broadcastToGroup(groupId, {
                    type: INTERNAL,
                    header: IMSG.START,
                    content: {
                        mm: "MATCH-START",
                        matchId: groupId
                    }
                });

                self.emit("match", "started", groupId);
                return Promise.resolve("match started.");
            })));
        }

        Object.keys(this._confirmations).forEach(groupId => {
            closure(groupId);
        });

        return Promise.all(promList).then(_r => {
            _r.map(refl => !!refl ? refl.e : refl).filter(v => !!v).forEach(e => super.log(`mmc interactions failed: ${e.message} 
            stack: ${e.stack}`));
            super.log(`match making confirmation logic has been executed, took: ${(Date.now() - startT)} ms.`);
            return true;
        });
    }

    _getQueueGroup(){

        if(!this._queueGroupId){
            throw new Error("queue group id is not set, it should be generated during open().");
        }

        return this.groupHandler.getGroupInstanceNoCalls(this._queueGroupId);
    }

    /**
     * called when the match making interval has found a group,
     * this function is only executed on server instances that run the match-making logic
     */
    _onFreshlyMatchedGroup(group){

        super.log(`handling freshly created match-group ${group.getId()}`);

        //we dont have to create the mmc just yet, because it is created with the first entry
        //but its important to store the information of a new confirmation round
        this._confirmations[group.getId()] = {
            opened: Date.now()
        };

        super.emit("match", "matched", group.getId());

        super.broadcastToGroup(group.getId(), {
            type: INTERNAL,
            header: IMSG.CONFIRM,
            content: {
                mm: "MATCH-FOUND",
                matchId: group.getId()
            }
        });
    }

    __handleConfirm(clientId, content, header){

        if(!content || typeof content.matchId !== "string"){
            super.log(clientId + " send bad confirmation, missing matchId.");
            return;
        }

        const groupId = content.matchId;
        this.groupHandler.getGroupInstance(groupId).then(group => {

            super.log(clientId + " client send confirmation message for group " + groupId);

            group.contains(clientId).then(isMember => {

                if(!isMember){
                    super.log(`${clientId} cannot confirm match group ${groupId}, since he is not a member of it.`);
                    return;
                }

                const mmc = new MatchMakingConfirmation(this._redis, groupId);
                mmc.push(clientId);
                mmc.expire(); //make sure this stuff is auto-cleaned

                //send notification that this client confirmed
                super.broadcastToGroup(groupId, {
                    from: clientId,
                    content: {
                        mm: "MATCH-CONFIRMED",
                        matchId: groupId
                    },
                    type: INTERNAL,
                    header: header + NOTIFY
                }).catch(e => {}); //send to self
            }, e => {
                super.log("failed check contains for group " + groupId + " and client " + clientId + ", because: " + e);
            });
        }, e => {
            super.log(`${clientId} wanted to confirm group ${groupId} but it failed with: ${e.message}.`);
        });
    }

    __search(clientId, content, header){

        this.groupHandler.getClientInstanceNoCalls(clientId).then(client => {
            client.list().then(groups => {

                if(!groups || groups.length === 0){

                    super.log("adding " + clientId + " to match making queue.");

                    this._getQueueGroup().then(group => {
                        group.push(clientId).then(_ => {
                            super.send(clientId, INTERNAL, {
                                successfull: true
                            }, header);
                        });
                    });

                    return;
                }

                super.log(`${clientId} cannot join match making queue, because client is already in groups/.`);
            });
        });
    }

    __broadcastUpdate(clientId, content, header){

        super.log("broadcasting match making queue message from client " + clientId);

        //access groupId directly
        super.broadcastToGroup(this._queueGroupId, {
            from: clientId,
            content: content.delivery,
            type: INTERNAL,
            header: header
        }, clientId).catch(NOOP);
    }

    __leave(clientId, content, header){

        super.log("removing " + clientId + " from match making queue.");

        this._getQueueGroup().then(group => {
            group.remove(clientId).then(_ => {
                super.send(clientId, INTERNAL, {
                    successfull: true
                }, header);
            });
        });
    }

    __handleExit(clientId, content, header){

        if(!content || typeof content.matchId !== "string"){
            super.log(clientId + " send bad match exit, missing matchId.");
            return;
        }

        const groupId = content.matchId;
        this.groupHandler.getGroupInstance(groupId).then(group => {

            group.contains(clientId).then(result => {

                if(!result){
                    super.log(clientId + " tried to exit match " + groupId + " but he is not a part of it.");
                    return;
                }

                super.log(clientId + " is exiting match " + groupId);
                group.remove(clientId).then(NOOP).catch(NOOP);

                super.broadcastToGroup(groupId, {
                    content: {
                        mm: "MATCH-EXIT",
                        matchId: groupId,
                        leaver: clientId
                    },
                    type: INTERNAL,
                    header: header
                }, clientId).catch(NOOP);

                super.emit("match", "exited", groupId, clientId);
            });
        }, e => {
            super.log(`${clientId} wanted to exit match ${groupId} but an error occurred: ${e.message}.`);
        });
    }

    __handleClose(clientId){
        this._getMatchOfClient(clientId).then(group => {

            if(!group){
                super.__leaveAllGroups(clientId); //-> GroupServer will not call this
                super.log(`client ${clientId} closed connection, but he was not a member of a match.`);
                return;
            }

            super.log(`client ${clientId} closed connection, he was a member of match: ${group.getId()}.`);
            super.__leaveAllGroups(clientId); //-> GroupServer will not call this

            super.broadcastToGroup(group.getId(), {
                content: {
                    mm: "MATCH-CLOSE",
                    matchId: group.getId(),
                    leaver: clientId
                },
                type: INTERNAL,
                header: IMSG.EXIT
            }, clientId).catch(NOOP);

            super.emit("match", "exited", group.getId(), clientId);
        });
    }

    /* ### handling client state updates below this line ### */

    _getMatchOfClient(clientId){
        return this.groupHandler.getClientInstanceNoCalls(clientId).then(client => {
            return client.list(groups => {

                if(!groups || groups.length !== 1){
                    return null;
                }

                //check if client is only a member of the match making queue
                if(groups[0].getId() === this._queueGroupId){
                    return null;
                }

                return groups[0];
            });
        });
    }

    __handleUpdateState(clientId, content, header){
        this._getMatchOfClient(clientId).then(groupId => {

            if(!groupId){
                return super.log(`received state of client ${clientId} but he is not a member of a match.`);
            }

            const state = new State(this._redis, groupId);
            state.updateState(clientId, content.state).then(_ => {}, e => {
                super.log(`failed to update client's ${clientId} state. err: ${e.message}.`);
            });
        });
    }

    __handleUpdateMessage(clientId, content, header){
        //TODO implement
    }

    __handleUpdateWorld(clientId, content, header){
        //TODO implement
    }

}

module.exports = RoomGroupServer;
