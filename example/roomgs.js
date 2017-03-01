const {RoomGroupServer} = require("./../index.js");
const {uhecatcher} = require("./../lib/tools/index.js");
const config = require("./config.json");

uhecatcher(console.log);

const serverConfig = JSON.parse(JSON.stringify(config.server));
serverConfig.log = console.log;

const server = new RoomGroupServer(serverConfig);
server.open().then(() => {

    console.log("open.");
    server.runAutoMatchmaking();

}, e => {
    console.log(e);
});