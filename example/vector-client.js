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
        socket.send(JSON.stringify(getJMessage("internal", {
            position: {
                x: 10,
                y: 12,
                z: 15
            }
        }, "VGS:POSITION")));
    }, 1000);
});

socket.on("message", message => {
    console.log("message: " + message);
});

socket.on("error", message => {
    console.log("error: " + message);
});

socket.on("close", message => {
    console.log("close: " + message);
});