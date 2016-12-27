const ws = require("ws");
const config = require("./config.json");
const server = "wss://localhost:" + config.server.port;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function playThrough(){

    const socket = new ws(server);

    socket.on("open", () => {
        setTimeout(() => {
            socket.send("luuulz 1");
            setTimeout(() => {
            socket.close();
            }, 100);
        }, 100);
    });

    socket.on("error", error => {
        console.log(error);
    });

    socket.on("message", message => {
        console.log(message);
    });
}

setInterval(() => {
    playThrough();
}, 220);