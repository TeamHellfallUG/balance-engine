const GroupServer = require("./GroupServer.js");

const INTERNAL = "internal";
const PREFIX = "RGS:";

const IMSG = {
    BROADCAST: PREFIX + "BROADCAST"
};

class RoomGroupServer extends GroupServer {

    constructor(config){
        super(config);

        this._groups = {};
        this._redis = null;

        this._attachInternalVectorListener();
    }

    open(){
        return super.open().then(_ => {
            this._redis = super._attachInternalRoomListener();
            return true;
        });
    }

    _attachInternalRoomListener(){

        super.log("room group layer active.");

        super.on(INTERNAL, ({clientId, header, content}) => {

            switch(header){

                case IMSG.BROADCAST:
                    this.__broadcastUpdate(clientId, content);
                    break;

                default: return; //ignore
            }
        });
    }

    __broadcastUpdate(clientId, content){

    }



}

module.exports = RoomGroupServer;