const JsonMessageLayerServer = require("./JsonMessageLayerServer.js");

const INTERNAL = "internal";
const PREFIX = "GS:";

const IMSG = {
    JOIN: PREFIX + "JOIN",
    LEAVE: PREFIX + "LEAVE",
    CREATE: PREFIX + "CREATE",
    DELETE: PREFIX + "DELETE",
    INVITE: PREFIX + "INVITE"
};

class GroupServer extends JsonMessageLayerServer {

    constructor(config){
        super(config);

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

                case IMSG.INVITE:
                    break;

                default: return; //ignore
            }
        });
    }
}

module.exports = GroupServer;