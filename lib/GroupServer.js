"use strict";

const JsonMessageLayerServer = require("./JsonMessageLayerServer.js");
const GroupHandler = require("./groups/GroupHandler.js");
const {uniquify} = require("./tools/index.js");

const INTERNAL = "internal";
const PREFIX = "GS:";
const NOTIFY = ":NOTIFY";

const IMSG = {
    JOIN: PREFIX + "JOIN",
    LEAVE: PREFIX + "LEAVE",
    CREATE: PREFIX + "CREATE",
    DELETE: PREFIX + "DELETE",
    BROADCAST: PREFIX + "BROADCAST",
    PING: PREFIX + "PING"
};

class GroupServer extends JsonMessageLayerServer {

    constructor(config, listenForLeaves = true){
        super(config);

        this.listenForLeaves = listenForLeaves;

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

        super.log("group layer active.");

        super.on(INTERNAL, ({clientId, header, content}) => {

            super.log("received internal message => " + header);
            switch(header){

                case IMSG.CREATE:
                    this.__createGroup(clientId, content, header);
                    break;

                case IMSG.DELETE:
                    this.__deleteGroup(clientId, content, header);
                    break;

                case IMSG.JOIN:
                    this.__joinGroup(clientId, content, header);
                    break;

                case IMSG.LEAVE:
                    this.__leaveGroup(clientId, content, header);
                    break;

                case IMSG.BROADCAST:
                    this.__broadcastGroup(clientId, content, header);
                    break;

                case IMSG.PING:
                    this.__ping(clientId, content, header);
                    break;

                case "CLOSE":
                    if(this.listenForLeaves){
                        this.__leaveAllGroups(clientId);
                    }
                break;

                default: return; //ignore
            }
        });
    }

    _notifyGroupForJOIN(groupId, clientId){

        super.log("notifying group about action -> JOIN.");

        return this.broadcastToGroup(groupId, {
            type: INTERNAL,
            header: IMSG.JOIN + NOTIFY,
            content: {
                clientId
            }
        }, clientId);
    }

    _notifyGroupForLEAVE(groupId, clientId){

        super.log("notifying group about action -> LEAVE.");

        return this.broadcastToGroup(groupId, {
            type: INTERNAL,
            header: IMSG.LEAVE + NOTIFY,
            content: {
                clientId
            }
        }, clientId);
    }

    _notifyGroupForDELETE(groupId, clientId){

        super.log("notifying group about action -> DELETE.");

        return this.broadcastToGroup(groupId, {
            type: INTERNAL,
            header: IMSG.DELETE + NOTIFY,
            content: {
                clientId
            }
        }, clientId);
    }

    __createGroupWithoutClient(){

        super.log("trying to create group");

        return this.groupHandler.createGroupInstance().then(group => {
            super.log("group " + group.key + " created");
            super.emit("group", "create", {clientId: null, groupId: group.key}); //emit event
            return group.key;
        });
    }

    __ping(clientId, _, header){

        super.log("trying to ping back for client: " + clientId);

        super.send(clientId, INTERNAL, {
            content: "PONG"
        }, header);
    }

    __createGroup(clientId, _, header){

        super.log("trying to create group for client: " + clientId);

        this.groupHandler.createGroupInstance().then(group => {
            group.push(clientId).then(_ => {

                super.log("group " + group.key + " created for client " + clientId);

                super.emit("group", "create", {clientId, groupId: group.key}); //emit event

                super.send(clientId, INTERNAL, {
                    successfull: true,
                    groupId: group.key
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            });
        }).catch(e => {
            super.log(e.message ? e.message : e);
            super.send(clientId, INTERNAL, {
                failed: true,
                error: e.message,
                groupId
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
        });
    }

    __deleteGroup(clientId, content, header){

        const groupId = content.groupId;
        if(!groupId){
            super.log("missing groupId for delete group.");
            super.send(clientId, INTERNAL, {
                failed: true,
                error: "missing groupId"
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
            return;
        }

        super.log("trying to delete group " + groupId);

        this.groupHandler.getGroupInstance(groupId).then(group => {
            group.erase().then(_ => {
                super.log("group " + groupId + " has been deleted.");

                super.emit("group", "delete", {clientId, groupId}); //emit event

                this._notifyGroupForDELETE(groupId, clientId);

                super.send(clientId, INTERNAL, {
                    successfull: true,
                    groupId
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            }, e => {
                super.log("failed to delete group " + groupId + " because " + e);
                super.send(clientId, INTERNAL, {
                    failed: true,
                    error: "an error occured",
                    groupId
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            });
        }, e => {
            super.log("group " + groupId + " does not exist. " + e);
            super.send(clientId, INTERNAL, {
                failed: true,
                error: "group does not exist.",
                groupId
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
        });
    }

    __joinGroup(clientId, content, header){

        const groupId = content.groupId;
        if(!groupId){
            super.log("missing groupId for join group.");
            super.send(clientId, INTERNAL, {
                failed: true,
                error: "missing groupId"
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
            return;
        }

        super.log("trying to make client " + clientId + " join group " + groupId);

        this.groupHandler.getGroupInstance(groupId).then(group => {
            group.push(clientId).then(_ => {
                super.log("group " + groupId + " has been joined by " + clientId);

                super.emit("group", "join", {clientId, groupId}); //emit event

                this._notifyGroupForJOIN(groupId, clientId);

                super.send(clientId, INTERNAL, {
                    successfull: true,
                    groupId
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            }, e => {
                super.log("failed to join group " + groupId + " because " + e);
                super.send(clientId, INTERNAL, {
                    failed: true,
                    error: "an error occured",
                    groupId
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            });
        }, e => {
            super.log("group " + groupId + " does not exist. " + e);
            super.send(clientId, INTERNAL, {
                failed: true,
                error: "group does not exist.",
                groupId
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
        });
    }

    __leaveGroup(clientId, content, header, reply = true){

        const groupId = content.groupId;
        if(!groupId){
            super.log("missing groupId for join group.");
            super.send(clientId, INTERNAL, {
                failed: true,
                error: "missing groupId"
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
            return;
        }

        super.log("trying to make client " + clientId + " leave group " + groupId);

        this.groupHandler.getGroupInstance(groupId).then(group => {
            group.remove(clientId).then(_ => {
                super.log("group " + groupId + " has been left by " + clientId);

                super.emit("group", "leave", {clientId, groupId}); //emit event

                this._notifyGroupForLEAVE(groupId, clientId);

                //do not reply if leaving groups because of connection close
                if(!reply){
                    return;
                }

                super.send(clientId, INTERNAL, {
                    successfull: true,
                    groupId
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            }, e => {
                super.log("failed to leave group " + groupId + " because " + e);
                super.send(clientId, INTERNAL, {
                    failed: true,
                    error: "an error occured",
                    groupId
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            });
        }, e => {
            super.log("group " + groupId + " does not exist. " + e);
            super.send(clientId, INTERNAL, {
                failed: true,
                error: "group does not exist.",
                groupId
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
        });
    }

    __broadcastGroup(clientId, content, header){

        const groupId = content.groupId;
        if(!groupId){
            super.log("missing groupId for broadcast group.");
            super.send(clientId, INTERNAL, {
                failed: true,
                error: "missing groupId"
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
            return;
        }

        super.log("trying to broadcast message from client " + clientId + " to group " + groupId);

        this.groupHandler.getClientInstance(clientId).then(client => {
            client.list().then(groups => {

                if(groups.length < 1 || groups.indexOf(groupId) === -1){
                    super.log("client " + clientId + " is not in group " + groupId + " cannot broadcast.");
                    super.send(clientId, INTERNAL, {
                        failed: true,
                        error: "client is not a member of this group",
                        groupId
                    }, header).then(r => {
                        super.log("message sent: " + r);
                    }, e => {
                        super.log("failed to send message: " + e);
                    });
                    return;
                }

                this.broadcastToGroup(groupId, {
                    from: clientId,
                    content: content.delivery,
                    group: groupId,
                    type: INTERNAL,
                    header: header
                }, clientId);
            });
        });
    }

    __leaveAllGroups(clientId){

        super.log("client " + clientId + " closed connection.. leaving all groups.");

        this.groupHandler.getClientInstanceNoCalls(clientId).then(client => {
            return client.list().then(groups => {
                if(!groups){
                    groups = [];
                }
                return Promise.all(groups.map(groupId => this.__leaveGroup(clientId, {groupId}, IMSG.LEAVE, false))).then(_ =>
                {}).catch(e => super.log(e));
            });
        });
    }

    /**
     * pass the clientId of the sender, so that its possible to remove him from the reciever list
     * @param groupId
     * @param message
     * @param clientId
     * @returns {Promise.<TResult>}
     */
    broadcastToGroup(groupId, message, clientId){
        return this.groupHandler.getGroupInstanceNoCalls(groupId).then(group => {
            group.list().then(clientIds => {

                if(!clientIds){
                    super.log("broadcast group " + groupId + " group is empty.");
                    return [];
                }

                if(clientId){
                    clientIds = clientIds.filter(cId => cId !== clientId);
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
            return client.list().then(groups => {
                if(!groups){
                    groups = [];
                }
                this.broadcastToGroupList(groups, message);
            });
        });
    }
}

module.exports = GroupServer;