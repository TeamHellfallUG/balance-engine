const {Server, WSProxy} = require("./../index.js");
const config = require("./config.json");
const path = require("path");

function getServerConfig(port){
    const serverConfig = JSON.parse(JSON.stringify(config.server));
    serverConfig.log = console.log;
    serverConfig.port = port;
    return serverConfig;
}

const upstreams = [
    {host: "localhost", port: 8081},
    {host: "localhost", port: 8082},
    {host: "localhost", port: 8083},
    {host: "localhost", port: 8084},
    {host: "localhost", port: 8085}
];

const opts = {
    ca: [],
    key: path.join(__dirname, "./key.pem"),
    cert: path.join(__dirname, "./cert.pem")
};

const mode = process.argv[2];

if(!mode){
    console.log("requires an argument [proxy, server].");
    return;
}

switch(mode){

    case "proxy":

        const proxy = new WSProxy({
            servers: upstreams,
            config: {
                port: config.server.port,
                useSsl: true,
                opts: opts
            },
            log: console.log
        });

        proxy.run().then(() => {
            console.log("proxy running..");
        }).catch(e => {
            console.log(e);
        });
        break;

    case "server":
        const servers = upstreams.map(upstream => new Server(getServerConfig(upstream.port)));
        Promise.all(servers.map(server => server.open())).then(() => {

            console.log("servers are up.");

            servers.forEach(server => {

                server.on("connection", client => {
                    server.broadcastGlobal("whats uppp " + client.clientId);
                });

                server.on("message", (clientId, message) => {
                    server.send(clientId, "hi there! => " + message + " from " + server.originId);
                });
            });

            setTimeout(() => {
                servers[1].close();
                servers[2].close();
                servers[3].close();
            }, 3000);

        }).catch(e => {
            console.log(e);
        });
        break;

    default:
        console.log(mode + " is not recognized use proxy or server.");
        break;
}