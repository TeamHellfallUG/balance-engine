const {RoomGroupServer} = require("./../index.js");
const {uhecatcher} = require("./../lib/tools/index.js");
const config = require("./config.json");

uhecatcher(console.log);

config.server.log = console.log;
config.udp.log = console.log;

const server = new RoomGroupServer(config);
server.open().then(() => {

    console.log("open.");
    server.runAutoMatchmaking();

}, e => {
    console.log(e);
});