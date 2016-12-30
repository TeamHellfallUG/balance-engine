const JsonMessageLayerServer = require("./JsonMessageLayerServer.js");
const GroupHandler = require("./GroupHandler.js");
const {uniquify} = require("./tools/index.js");

const INTERNAL = "internal";
const PREFIX = "GS:";

const IMSG = {
    JOIN: PREFIX + "JOIN",
    LEAVE: PREFIX + "LEAVE",
    CREATE: PREFIX + "CREATE",
    DELETE: PREFIX + "DELETE"
};

class GroupServer extends JsonMessageLayerServer {

    constructor(config){
        super(config);

        this.groupHandler = new GroupHandler({
            redis: super._getStandaloneRedisClient()
        });

        this._attachInternalListener();
    }

    open(){
        return super.open().then(_ => {
            return _;
        });
    }

    _attachInternalListener(){

        super.log("grouplayer active.");

        super.on(INTERNAL, ({clientId, header, content}) => {

            super.log("received internal message => " + header);
            switch(header){

                case IMSG.CREATE:
                    super.send(clientId, INTERNAL, "created.", header);
                    break;

                case IMSG.DELETE:
                    break;

                case IMSG.JOIN:
                    break;

                case IMSG.LEAVE:
                    break;

                default: return; //ignore
            }
        });
    }

    __createGroup(){

    }

    __deleteGroup(){

    }

    __joinGroup(){

    }

    __leaveGroup(){

    }

    broadcastToGroup(groupId, message){
        return this.groupHandler.getGroupInstanceNoCalls(groupId).then(group => {
            group.list().then(clientIds => {

                if(!clientIds){
                    super.log("broadcast group " + groupId + " group is empty.");
                    return [];
                }

                return super.sendList(clientIds, message);
            });
        });
    }

    broadcastToGroupList(groupIds, message){
        return Promise.all(groupIds.map(groupId => this.groupHandler.getGroupInstanceNoCalls(groupId)))
            .then(groups => Promise.all(groups.map(group => group.list()))
                .then(clientLists => {
                    return super.sendList(uniquify(clientLists), message);
                }));
    }

    broadcastToAllGroupsOfClient(clientId, message){
        return this.groupHandler.getClientInstanceNoCalls(clientId).then(client => {
            return client.list().then(groups => this.broadcastToGroupList(groups, message));
        });
    }
}

module.exports = GroupServer;