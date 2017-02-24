const GroupServer = require("./GroupServer.js");

const {reflect} = require("./tools/index.js");

const INTERNAL = "internal";
const PREFIX = "RGS:";
const NOTIFY = ":NOTIFY";

const IMSG = {
    BROADCAST: PREFIX + "BROADCAST",
    SEARCH: PREFIX + "SEARCH",
    LEAVE: PREFIX + "LEAVE",
    CONFIRM: PREFIX + "CONFIRM"
};

const INTERNAL_INTERVAL_MS = 3200;

class RoomGroupServer extends GroupServer {

    constructor(config){
        super(config);

        this._groups = {};
        this._redis = null;
        this.lobbySize = config.lobbySize || 3;

        this._queueGroupId = null;
        this._t = null;

        this._attachInternalRoomListener();
    }

    open(){
        return super.open().then(_ => {
            this._redis = super._getStandaloneRedisClient();
            return super.__createGroupWithoutClient().then(groupId => {
                this._queueGroupId = groupId;
                super.log("created group " + groupId + " for queue.");
                return true;
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

                default: return; //ignore
            }
        });
    }

    _runInternalInterval(){

        if(this._t){
            throw new Error("internal interval is already active.");
        }

        super.log("interal match-making interval is active.");

        this._t = setInterval(() => {

            this._executeMatchMakingLogic(true).then(_ => {
                //empty
            }, e => {
                super.log(`match making logic execution failed with an error: ${e.message} and stack: ${e.stack}.`);
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
                    _r.map(refl => refl.e).filter(v => !!v).forEach(e => super.log(`mm group interactions failed: ${e.message} stack: ${e.stack}`));
                    newGroups.forEach(g => this._onFreshlyMatchedGroup(g)); //call handler to initiate match

                    super.log(`match making logic has been executed, took: ${(Date.now() - startT)} ms.`);
                    return true; //eofmm
                });
            });
        });
    }

    _getQueueGroup(){

        if(!this._queueGroupId){
            throw new Error("queue group id is not set, it should be generated during open().");
        }

        return this.groupHandler.getGroupInstanceNoCalls(this._queueGroupId);
    }

    /**
     * called when the match making interval has found a group
     */
    _onFreshlyMatchedGroup(group){

        super.log(`handling freshly created match-group ${group.getId()}`);

        //TODO await confirmation of every participant in group

        super.broadcastToGroup(group.getId(), {
            type: INTERNAL,
            header: IMSG.CONFIRM,
            message: {
                mm: "MATCH-FOUND",
                matchId: group.getId()
            }
        });
    }

    __search(clientId, content, header){

        super.log("adding " + clientId + " to match making queue.");

        this._getQueueGroup().then(group => {
            group.push(clientId).then(_ => {
                super.send(clientId, INTERNAL, {
                    successfull: true
                }, header);
            });
        });
    }

    __broadcastUpdate(clientId, content, header){

        super.log("broadcasting match making queue message from client " + clientId);

        //access groupId directly
        super.broadcastToGroup(this._queueGroupId, {
            from: clientId,
            message: content.delivery,
            type: INTERNAL,
            header: header
        }, clientId).catch(e => {});
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

}

module.exports = RoomGroupServer;
