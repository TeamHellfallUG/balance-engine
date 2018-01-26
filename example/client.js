const ws = require("uws");
const config = require("./config.json");
const server = "ws://localhost:" + config.server.port;
const socket = new ws(server);

socket.on("open", () => {
    setTimeout(() => {
        socket.send("luuulz");
    }, 1000);
});

socket.on("message", message => {
    console.log(message);
});
