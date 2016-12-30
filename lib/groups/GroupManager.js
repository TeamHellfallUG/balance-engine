class GroupManager {

    /**
     * group manager actually wraps redis HASH type
     * @param redis
     * @param key
     */
    constructor(redis, key){
        this.redis = redis;
        this.key = key;
    }

    exists(){
        //return this.redis.exists(this.key);
        return this.redis.type(this.key).then(type => type === "hash");
    }

    size(){
        return this.redis.hlen(this.key);
    }

    list(){
        return this.redis.hgetall(this.key);
    }

    keys(){
        return this.redis.hkeys(this.key);
    }

    values(){
        return this.redis.hvals(this.key);
    }

    get(key){
        return this.redis.hget(this.key, key).then(json => {

            try {
                const obj = JSON.parse(json);
                if(obj){
                    return obj;
                }
            } catch(e){
                //empty
            }

            return json;
        });
    }

    set(key, value){

        if(typeof value !== "string"){
            value = JSON.stringify(value);
        }

        return this.redis.hset(this.key, key, value);
    }

    remove(key){
        return this.redis.hdel(this.key, key);
    }

    erase(){
        return this.redis.del(this.key);
    }
}

module.exports = GroupManager;