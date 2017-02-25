"use strict";

const GroupServer = require("./GroupServer.js");
const {vector} = require("./tools/index.js");

const INTERNAL = "internal";
const PREFIX = "VGS:";
const CLIENT_CELL_PREFIX = "vgs:client:current:cell:";
const DEFAULT_CELL_TTL = 60 * 15; //15 minutes

const IMSG = {
    POSITION: PREFIX + "POSITION",
    BROADCAST: PREFIX + "BROADCAST"
};

class VectorGroupServer extends GroupServer {

    constructor(config){
        super(config);

        this._groups = {}; //these are actually world-to-grid-cells
        this._gridSize = config.gridSize || 6;
        this._isUnity3D = config.isUnity3D || false;
        this._redis = null;

        this._attachInternalVectorListener();
    }

    open(){
        return super.open().then(_ => {
            this._redis = super._getStandaloneRedisClient();
            return this._preheatGroups();
        });
    }

    _attachInternalVectorListener(){

        super.log("vector group layer active.");

        super.on(INTERNAL, ({clientId, header, content}) => {

            switch(header){

                case IMSG.POSITION:
                    this.__positionUpdate(clientId, content, header);
                    break;

                case IMSG.BROADCAST:
                    this.__broadcastUpdate(clientId, content, header);
                    break;

                default: return; //ignore
            }
        });
    }

    /**
     * ramps up groups in redis using the open() promise chain
     * @returns {Promise.<TResult>}
     * @private
     */
    _preheatGroups(){

        super.log("preheating groups..");

        const createPromises = [];

        const self = this;
        function cpClosure(vec){
            createPromises.push(self.__createGroupWithoutClient().then(id => ({
                    vectorId: vector.getVectorId(vec),
                    groupId: id
                })
            ));
        }

        for(let x = 0; x < this._gridSize + 1; x++){
            for(let y = 0; y < this._gridSize + 1; y++){

                const vec = this._isUnity3D ?
                    vector.worldToGridCoordinates(vector.getVector(x * this._gridSize, 0, y * this._gridSize), this._gridSize, true) :
                    vector.worldToGridCoordinates(vector.getVector(x * this._gridSize, y * this._gridSize, 0), this._gridSize, false);

                cpClosure(vec);
            }
        }

        return Promise.all(createPromises).then(vectors => {

            vectors.forEach(v => {
                this._groups[v.vectorId] = v.groupId;
            });

            super.log(`preheated ${(Object.keys(this._groups).length)} groups on gridsize ${this._gridSize}.`);
            return true;
        });
    }

    getCurrentCellOfClient(clientId){
        return this._redis.get(CLIENT_CELL_PREFIX + clientId);
    }

    setCurrentCellOfClient(clientId, cell){
        return this._redis.set(CLIENT_CELL_PREFIX + clientId, cell, "EX", DEFAULT_CELL_TTL);
    }

    __positionUpdate(clientId, content, header){

        const gridVector = vector.worldToGridCoordinates(vector.getVector(
            content.position.x,
            content.position.y,
            content.position.z), this._gridSize, this._isUnity3D);

        const vectorId = vector.getVectorId(gridVector);
        const groupId = this._groups[vectorId];

        if(!groupId){
            throw new Error("a group is missing for id: " + vectorId);
        }

        if(!content || typeof content !== "object"){
            throw new Error("positionUpdate content must be an object.");
        }

        content.from = clientId;
        content.type = INTERNAL;
        content.header = header;

        this.getCurrentCellOfClient(clientId).then(cell => {

            //store latest position
            this.setCurrentCellOfClient(clientId, vectorId);

            //check if client has switched cells
            //(first one will be null and also trigger)
            if(cell !== vectorId){

                //join new group for the "new" cell
                super.__joinGroup(clientId, {groupId}, "GS:JOIN");

                //if old cell exists the client is part of a group and should leave it
                if(cell){
                    const oldGroupId = this._groups[cell];
                    if(oldGroupId){
                        super.__leaveGroup(clientId, {oldGroupId}, "GS:LEAVE");
                    }
                }

                //make sure to let a moment pass before broadcasting, because the
                //client might not be member of the group otherwise
                setTimeout(() => {
                    this.broadcastToGroup(groupId, content, clientId); //broadcast to new group
                }, 500);
                return;
            }

            //client did not switch cells
            this.broadcastToGroup(groupId, content, clientId).catch(e => super.log(e)); //broadcast to current group
        });
    }

    __broadcastUpdate(clientId, content, header){

        if(!content || typeof content !== "object"){
            throw new Error("broadcastUpdate content must be an object.");
        }

        this.getCurrentCellOfClient(clientId).then(cell => {

            const groupId = this._groups[cell];
            if(cell && groupId){

                content.from = clientId;
                content.group = groupId;
                content.type = INTERNAL;
                content.header = header;

                this.broadcastToGroup(groupId, content, clientId).catch(e => super.log(e));
                return;
            }

            super.send(clientId, INTERNAL, {error: "client is in no current cell, cannot broadcast"}, IMSG.BROADCAST)
                .catch(e => super.log(e));
        });
    }
}

module.exports = VectorGroupServer;