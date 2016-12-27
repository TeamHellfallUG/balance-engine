const ws = require("ws");
const config = require("./config.json");
const server = "ws://localhost:" + config.server.port;
const socket = new ws(server);

function getJMessage(type, content, header){

    if(!header) {
        return {
            type,
            content
        };
    }

    return {
        type,
        header,
        content
    };
}

socket.on("open", () => {
    setTimeout(() => {
        socket.send(JSON.stringify(getJMessage("internal", "", "GS:CREATE")));
    }, 1000);
});

socket.on("message", message => {
    console.log(message);
});