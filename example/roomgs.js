const {RoomGroupServer, ServiceRegistry} = require("./../index.js");
const {uhecatcher} = require("./../lib/tools/index.js");
const config = require("./config.json");

uhecatcher(console.log);

config.server.log = console.log;
config.udp.log = console.log;

const registry = new ServiceRegistry({
    redisConfig: config.server.redis,
    port: config.registry.port,
    authorization: config.registry.authorization
});

registry.start().then(() => {
    console.log("registry up.");
}, e => {
    console.log(e);
});

const server = new RoomGroupServer(config);
server.open().then(() => {

    console.log("roomgs up.");
    server.runAutoMatchmaking();
    server.runServiceDiscovery("roomgs", "eu1", "192.168.1.2");

}, e => {
    console.log(e);
});