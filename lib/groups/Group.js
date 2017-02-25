const uuid = require("uuid");

const {reflect} = require("./../tools/index.js");

class Group {

    /**
     * represents a group containing a list of clientIds
     * group actually wraps a redis LIST type
     * @param redis
     * @param manager
     * @param key
     */
    constructor(redis, manager, key){
        this.redis = redis;
        this.manager = manager;
        this.key = key ? key : ("g:" + uuid.v4());
    }

    //alias
    getId(){
        return this.key;
    }

    exists(){
        //return this.redis.exists(this.key);
        return this.redis.type(this.key).then(type => type === "list");
    }

    size(){
        return this.redis.llen(this.key);
    }

    list(){
        return this.redis.lrange(this.key, 0, -1);
    }

    contains(clientId){
        return this.list().then(clientIds => !!(clientIds && clientIds.indexOf(clientId) !== -1));
    }

    push(clientId, simple = false){
        return this.list().then(clientIds => {

            if(clientIds && clientIds.indexOf(clientId) !== -1){
                return Promise.reject(clientId + " is already a part of group " + this.key);
            }

            if(simple){
                return this.redis.lpush(this.key, clientId);
            }

            const clientGroup = new ClientGroup(this.redis, this.manager, clientId);
            //add to clients group first
            return clientGroup.push(this.key, true).then(_ => {
                //than add client to group
                return this.redis.lpush(this.key, clientId);
            });
        });
    }

    /**
     * use with caution, can result in a large amount of async calls
     */
    pushMulti(clientIds, simple = false){
        return Promise.all(clientIds.map(clientId => reflect(this.push(clientId, simple))));
    }

    remove(clientId, simple = false){

        if(simple){
            return this.redis.lrem(this.key, 0, clientId);
        }

        const clientGroup = new ClientGroup(this.redis, this.manager, clientId);
        //remove group from client first
        return clientGroup.remove(this.key, true).then(_ => {
            //then remove client from group
            return this.redis.lrem(this.key, 0, clientId);
        });
    }

    /**
     * use with caution, can result in a large amount of async calls
     */
    removeMulti(clientIds, simple = false){
        return Promise.all(clientIds.map(clientId => reflect(this.remove(clientId, simple))));
    }

    erase(simple = false){

        if(simple){
            return this.redis.del(this.key);
        }

        //get a list and remove the group from all clients first
        return this.list().then(clientIds => {
            return Promise.all(clientIds.map(clientId => {
                const clientGroup = new ClientGroup(this.redis, this.manager, clientId);
                return clientGroup.remove(this.key, true);
            }));
        }).then(_ => {
            //removes itself from them group manager set as well
            return this.manager.remove(this.key).then(_ => {
                //finally remove the group
                return this.redis.del(this.key);
            });
        });
    }
}

class ClientGroup {

    /**
     * represents a client that holds a list of groupIds
     * client group actually wraps a redis LIST type
     * @param redis
     * @param manager
     * @param clientId
     */
    constructor(redis, manager, clientId){

        if(typeof clientId !== "string"){
            throw new Error("client groups requires key to be set, clientIds cannot be generated.");
        }

        this.redis = redis;
        this.manager = manager;
        this.key = clientId;
    }

    exists(){
        //return this.redis.exists(this.key);
        return this.redis.type(this.key).then(type => type === "list");
    }

    list(){
        return this.redis.lrange(this.key, 0, -1);
    }

    push(groupId, simple = false){
        return this.list().then(groupIds => {

            if (groupIds && groupIds.indexOf(groupId) !== -1) {
                return Promise.reject(groupId + " is already a part of client's group " + this.key);
            }

            if (simple) {
                return this.redis.lpush(this.key, groupId);
            }

            const group = new Group(this.redis, this.manager, groupId);
            //add client to group first
            return group.push(this.key, true).then(_ => {
                //then add client group
                return this.redis.lpush(this.key, groupId);
            });
        });
    }

    pushMulti(groupIds, simple = false){
        throw new Error("not implemented"); //TODO add multi push feature
    }

    remove(groupId, simple = false){

        if(simple){
            return this.redis.lrem(this.key, 0, groupId);
        }

        const group = new Group(this.redis, this.manager, groupId);
        //remove client from group first
        return group.remove(this.key, true).then(_ => {
            //then remove client group
            return this.redis.lrem(this.key, 0, groupId);
        });
    }

    erase(simple = false){

        if(simple){
            return this.redis.del(this.key);
        }

        //get a list of groups and remove the client from these groups
        return this.list().then(groupIds => {
            return Promise.all(groupIds.map(groupId => {
                const group = new Group(this.redis, this.manager, groupId);
                return group.remove(this.key, true);
            }));
        }).then(_ => {
            //removes itself from them group manager set as well
            this.manager.remove(this.key).then(_ => {
                //finally remove client group
                return this.redis.del(this.key);
            });
        });
    }
}

module.exports = {Group, ClientGroup};
