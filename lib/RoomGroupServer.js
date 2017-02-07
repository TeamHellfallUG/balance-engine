const GroupServer = require("./GroupServer.js");

const {reflect} = require("./tools/reflect.js");

const INTERNAL = "internal";
const PREFIX = "RGS:";

const IMSG = {
    BROADCAST: PREFIX + "BROADCAST",
    SEARCH: PREFIX + "SEARCH",
    LEAVE: PREFIX + "LEAVE"
};

const INTERNAL_INTERVAL_MS = 2000;

class RoomGroupServer extends GroupServer {

    constructor(config){
        super(config);

        this._groups = {};
        this._redis = null;
        this.lobbySize = config.lobbySize || 3;

        this._queueGroupId = null;
        this._t = null;

        this._attachInternalVectorListener();
    }

    open(){
        return super.open().then(_ => {
            this._redis = super._attachInternalRoomListener();
            return super.__createGroupWithoutClient().then(groupId => {
                this._queueGroupId = groupId;
                super.log("created group " + groupId + " for queue.");
                return true;
            });
        });
    }

    runMatchmaking(){
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
            this._getQueueGroup().then(group => {
                group.list().then(clientIds => {

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

                    //clients are now seperated into multiple arrays with the lobbysize 

                    super.log(`${clientGroups.length} groups will be created from match making queue.`);

                    const newGroups = [];
                    const newGroupsPromises = [];
                    clientGroups.forEach(cList => {

                        if(group.length >= this.lobbySize){
                            return; //skip groups that have not been fully filled (last one probably)
                        }

                        newGroupPromises.push(reflect(group.multiRemove(cList).then(_ => {
                            return super.groupHandler.createGroupInstance(newGroup => {
                                newGroups.push(newGroup); //store the new group
                                return newGroup.multiPush(cList); //but also push all clients into group
                            });
                        })));
                    });

                    //await the removal and multiPush of all groups
                    Promise.all(newGroupsPromises).then(_r => {
                        super.log(`${_r.length} groups created from match making queue.`);
                        newGroups.forEach(g => this._onFreshlyMatchedGroup(g)); //call handler to initiate match
                    });
                });
            });
        }, INTERNAL_INTERVAL_MS);
    }

    _getQueueGroup(){

        if(!this._queueGroupId){
            throw new Error("queue group id is not set, it should be generated during open().");
        }

        return super.groupHandler.getGroupInstanceNoCalls(this._queueGroupId);
    }

    /**
     * called when the match making interval has found a group
     */
    _onFreshlyMatchedGroup(group){
        //TODO handle match initiation
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
