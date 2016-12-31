const JsonMessageLayerServer = require("./JsonMessageLayerServer.js");
const GroupHandler = require("./GroupHandler.js");
const {uniquify} = require("./tools/index.js");

const INTERNAL = "internal";
const PREFIX = "GS:";

const IMSG = {
    JOIN: PREFIX + "JOIN",
    LEAVE: PREFIX + "LEAVE",
    CREATE: PREFIX + "CREATE",
    DELETE: PREFIX + "DELETE",
    BROADCAST: PREFIX + "BROADCAST"
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

                default: return; //ignore
            }
        });
    }

    __createGroup(clientId, content, header){

        super.log("trying to create group for client: " + clientId);

        this.groupHandler.createGroupInstance().then(group => {
            group.push(clientId).then(_ => {

                super.log("group " + group.key + " created for client " + clientId);

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
                error: e.message
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
                super.send(clientId, INTERNAL, {
                    successfull: true
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            }, e => {
                super.log("failed to delete group " + groupId + " because " + e);
                super.send(clientId, INTERNAL, {
                    failed: true,
                    error: "an error occured"
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
                error: "group does not exist."
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
        });
    }

    //TODO send info to all members of a group if client joins or leaves

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
                super.send(clientId, INTERNAL, {
                    successfull: true
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            }, e => {
                super.log("failed to join group " + groupId + " because " + e);
                super.send(clientId, INTERNAL, {
                    failed: true,
                    error: "an error occured"
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
                error: "group does not exist."
            }, header).then(r => {
                super.log("message sent: " + r);
            }, e => {
                super.log("failed to send message: " + e);
            });
        });
    }

    __leaveGroup(clientId, content, header){

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
                super.send(clientId, INTERNAL, {
                    successfull: true
                }, header).then(r => {
                    super.log("message sent: " + r);
                }, e => {
                    super.log("failed to send message: " + e);
                });
            }, e => {
                super.log("failed to leave group " + groupId + " because " + e);
                super.send(clientId, INTERNAL, {
                    failed: true,
                    error: "an error occured"
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
                error: "group does not exist."
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
                        error: "client is not a member of this group"
                    }, header).then(r => {
                        super.log("message sent: " + r);
                    }, e => {
                        super.log("failed to send message: " + e);
                    });
                    return;
                }

                this.broadcastToGroup(groupId, {
                    from: clientId,
                    message: content.delivery
                })
            });
        });
    }

    broadcastToGroup(groupId, message){
        //TODO dont send to "sending" clientId
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