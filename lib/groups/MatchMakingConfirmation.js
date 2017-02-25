const DEFAULT_EXPIRE_TIMEOUT = 120;

class MatchMakingConfirmation {

    /**
     * represents a list of clients that have to confirm their interest in joining a match
     * MMC actually wraps a redis LIST type
     * @param redis
     * @param groupId
     */
    constructor(redis, groupId){
        this.redis = redis;
        this.key = "mmc:" + groupId;
    }

    expire(){
        return this.redis.expire(this.key, DEFAULT_EXPIRE_TIMEOUT);
    }

    size(){
        return this.redis.llen(this.key);
    }

    list(){
        return this.redis.lrange(this.key, 0, -1);
    }

    push(clientId){
        return this.list().then(clientIds => {

            if(clientIds && clientIds.indexOf(clientId) !== -1){
                return Promise.reject(clientId + " is already a part of mmc " + this.key);
            }

            return this.redis.lpush(this.key, clientId);
        });
    }

    erase(){
        return this.redis.del(this.key);
    }
}

module.exports = MatchMakingConfirmation;
