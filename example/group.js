const {GroupServer} = require("./../index.js");
const config = require("./config.json");

const serverConfig = JSON.parse(JSON.stringify(config.server));
serverConfig.log = console.log;

const server = new GroupServer(serverConfig);
server.open().then(() => {

    console.log("open.");

    server.on("connection", client => {
        console.log(client);
    });

    /*
    server.on("message", (clientId, message) => {
        console.log("derp => " + message);
    }); */

    server.on("jmessage", (clientId, message) => {
        console.log(message);
    });

    server.on("close", client => {
        console.log("ohh.. " + client.clientId + " left..");
    });
}, e => {
    console.log(e);
});
