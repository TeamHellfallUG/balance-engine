"use strict";

const {Group, ClientGroup} = require("./Group.js");
const GroupManager = require("./GroupManager.js");

const GROUP_HANDLER_KEY = "BALANCE:GROUP:HANDLER";

/**
 * Group (contains a list of clientIds) and ClientGroup (contains a list of groupIds)
 * can both be used to access the same functionality, which makes the api quite flexible,
 * because there is no need to manually remove a clientId from a group list and vise versa if only
 * one of the objects is used for an action.
 *
 * The reason for this is because the push, remove and erase functions actually instantiate an object
 * of the opposite class Group => ClientGroup, ClientGroup => Group and run the corresponding function
 * of the other side e.g. group.remove(clientId) calls [clientId]clientGroup.remove(groupId) beforehand.
 *
 * To ensure that no info is lost redis keys are prefixed with c: (automatically for clients) and g: for groups
 * and all keys (list types) are registered with in a redis hash object with the help of the create and getInstance
 * functions of GroupHandler.
 */

class GroupHandler {

    constructor({redis}){

        if(!redis){
            throw new Error("group handler requires a valid ioredis instance.");
        }

        this.redis = redis;
        this.groupManager = new GroupManager(redis, GROUP_HANDLER_KEY);
    }

    /**
     * creates a new Group Instance
     * (will be set in redis hash type)
     * @returns {Promise.<{}>}
     */
    createGroupInstance(){

        const group = new Group(this.redis, this.groupManager);

        return this.groupManager.set(group.key, {
            createdAt: Date.now()
        }).then(_ => {
            return group;
        });
    }

    /**
     * gets a group instance for its groupId
     * (will check redis hash type and existance of key itself)
     * @param groupId
     * @returns {Promise.<{}>}
     */
    getGroupInstance(groupId){

        if(typeof groupId !== "string"){
            return Promise.reject(new Error("requires a groupId to get a group instance."));
        }

        const group = new Group(this.redis, this.groupManager, groupId);

        return this.groupManager.get(groupId).then(info => {

            if(!info){
                return group.erase().then(_ => {
                   throw new Error("DOES_NOT_EXIST");
                });
            }

            return group;

            /* an empty list will not return list as type
            return group.exists().then(exists => {

                if(!exists){
                    return this.groupManager.remove(groupId).then(_ => {
                        throw new Error("HAD_TO_DELETE");
                    });
                }

                return group;
            });
            */
        });
    }

    /**
     * resolves into a group instance without making any calls to redis
     * @param groupId
     * @returns {Promise.<*>}
     */
    getGroupInstanceNoCalls(groupId){
        return Promise.resolve(new Group(this.redis, this.groupManager, groupId));
    }

    /**
     * is an alias of getClientInstance
     * @param clientId
     * @returns {Promise.<{}>}
     */
    createClientInstance(clientId){
        return this.getClientInstance(clientId);
    }

    /**
     * gets a client (ClientGroup) instance
     * will create one of it does not exist (in redis hash)
     * @param clientId
     * @returns {Promise.<{}>}
     */
    getClientInstance(clientId){

        if(typeof clientId !== "string"){
            return Promise.reject(new Error("requires a clientId to get or create a client group instance."));
        }

        const client = new ClientGroup(this.redis, this.groupManager, clientId);
        return this.groupManager.get(clientId).then(info => {

            if(info){
                info.lastAction = Date.now();
                return this.groupManager.set(clientId, info).then(_ => {
                    return client;
                });
            }

            return this.groupManager.set(clientId, {
                createdAt: Date.now(),
                lastAction: Date.now()
            }).then(_ => {
                return client;
            });
        });
    }

    /**
     * resolves into a client (ClientGroup) instance without making any calls to redis
     * @returns {Promise.<*>}
     * @param clientId
     */
    getClientInstanceNoCalls(clientId){
        return Promise.resolve(new ClientGroup(this.redis, this.groupManager, clientId));
    }

    /**
     * can be used to sync Group with ClientGroup in redis itself (list types)
     * uses scanGroupsForClient which is dangerous
     * @param clientId
     * @returns {Promise.<{}>}
     */
    setNewClientGroupFromExistingGroupsForClient(clientId){
        return this.scanGroupsForClient(clientId).then(groups => {
            const client = new ClientGroup(this.redis, this.groupManager, clientId);
            client.erase(true).then(_ => {

                if(groups.length < 1){
                    return client;
                }

                return client.pushMulti(groups, true).then(_ => {
                    return client;
                });
            });
        });
    }

    /**
     * this consumes a lot of memory and requires a large amount of redis calls dependend on
     * the amount of clients and groups that are existing
     * @param clientId
     * @returns {Promise.<[]>}
     */
    scanGroupsForClient(clientId){
        return this.groupManager.keys().then(groups => {
            const groupClients = groups.map(group => (new Group(this.redis, null, group)).list());
            return Promise.all(groupClients).then(clientLists => {

                let i = -1;
                const scan = [];
                let listIndex = -1;
                clientLists.forEach(list => {
                    listIndex++;

                    if(!Array.isArray(list)){
                        return;
                    }

                    for(i = 0; i < list.length; i++){
                        if(list[i] === clientId){
                            scan.push(groups[listIndex]);
                            break;
                        }
                    }
                });

                return scan;
            });
        });
    }
}

module.exports = GroupHandler;