const {Server} = require("./../index.js");
const config = require("./config.json");

const serverConfig = JSON.parse(JSON.stringify(config.server));
serverConfig.log = console.log;

const server = new Server(serverConfig);
server.open().then(() => {

    console.log("open.");
    
    server.on("connection", client => {
        console.log(client);
        server.broadcastGlobal("whats uppp " + client.clientId);
    });

    server.on("message", (clientId, message, originId) => {
        console.log("derp => " + message);
        server.send(clientId, "hi there! => " + message);
    });

    server.on("close", client => {
        console.log("ohh.. " + client.clientId + " left..");
    });
}, e => {
    console.log(e);
});
