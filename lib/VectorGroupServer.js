const GroupServer = require("./GroupServer.js");
const {vector} = require("./tools/index.js");

const INTERNAL = "internal";
const PREFIX = "VGS:";

const IMSG = {
    POSITION: PREFIX + "POSITION"
};

class VectorGroupServer extends GroupServer {

    constructor(config){
        super(config);

        this._groups = {};
        this._gridSize = config.gridSize || 26;
        this._isUnity3D = config.isUnity3D || false;

        this._attachInternalVectorListener();
    }

    open(){
        return super.open().then(_ => {
            return this._preheatGroups();
        });
    }

    _attachInternalVectorListener(){

        super.log("vector group layer active.");

        super.on(INTERNAL, ({clientId, header, content}) => {

            switch(header){

                case IMSG.POSITION:
                    this.__positionUpdate(clientId, content);
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
        let vec = null;
        for(let x = 0; x < this._gridSize; x++){
            for(let y = 0; y < this._gridSize; y++){

                vec = this._isUnity3D ?
                    vector.worldToGridCoordinates(vector.getVector(x, 0, y), this._gridSize, true) :
                    vector.worldToGridCoordinates(vector.getVector(x, y, 0), this._gridSize, false);

                createPromises.push(super.__createGroupWithoutClient().then(id => ({
                    vectorId: vector.getVectorId(vec),
                    groupId: id
                    })
                ));
            }
        }

        return Promise.all(createPromises).then(vectors => {

            console.log(vectors);
            return; //TODO world to grid does not seem to work properly yet always returns 1:1:0

            vectors.forEach(v => {
                this._groups[v.vectorId] = v.groupId;
            });

            super.log(`preheated ${(Object.keys(this._groups).length)} groups on gridsize ${this._gridSize}.`);
            return true;
        });
    }

    __positionUpdate(clientId, content){

        const gridVector = vector.worldToGridCoordinates(vector.getVector(
            content.position.x,
            content.position.y,
            content.position.z), this._gridSize, this._isUnity3D);

        const vectorId = vector.getVectorId(gridVector);
        const groupId = this._groups[vectorId];

        if(!groupId){
            throw new Error("a group is missing for id: " + vectorId);
        }

        //TODO check for group changes, we need to know the last position of the client?
    }

}

module.exports = VectorGroupServer;