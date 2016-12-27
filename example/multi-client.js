const ws = require("ws");
const config = require("./config.json");
const server = "wss://localhost:" + config.server.port;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function playThrough(i){

    const socket = new ws(server);

    socket.on("open", () => {
        setTimeout(() => {
            socket.send("luuulz " + i, (e) => {if(e){console.log(e);}});
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
    [1,2,3,4,5].forEach(i => playThrough(i));
}, 220);