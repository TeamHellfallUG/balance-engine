const {Server, Proxy} = require("./../index.js");
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

const proxy = new Proxy({
    servers: upstreams,
    config: {
        port: config.server.port,
        useSsl: true,
        opts: opts
    }
});

let servers = null;

proxy.run().then(() => {

    console.log("proxy running..");

    servers = upstreams.map(upstream => new Server(getServerConfig(upstream.port)));
    return Promise.all(servers.map(server => server.open()));
}).then(() => {

    console.log("servers are up.");

    servers.forEach(server => {

        server.on("connection", client => {
            server.broadcastGlobal("whats uppp " + client.clientId);
        });

        server.on("message", (clientId, message, originId) => {
            server.send(clientId, "hi there! => " + message);
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