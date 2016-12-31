const expect = require("expect.js");

const {GroupServer, SimpleClient} = require("./../../index.js");
const config = require("./test-config.json");

describe("GroupServer Integration", function(){

    const serverConfig = JSON.parse(JSON.stringify(config.server));
    serverConfig.log = (msg) => {
        console.log("server: " + msg);
    };

    const clientConfig = {
        host: "localhost",
        port: serverConfig.port,
        log: (msg) => {
            console.log("client: " + msg);
        }
    };

    let server = null;
    let client = null;
    let client2 = null;
    let groupId = null;

    before(function(done){
        done();
    });

    after(function(done){
        setTimeout(() => {
            server.close();
            client.close();
            client2.close();
            done();
        }, 500);
    });

    it("should be able to start the group server", function(done){

        server = new GroupServer(serverConfig);
        server.open().then(() => {

            server.on("connection", client => {
            });

            server.on("jmessage", (clientId, message) => {
            });

            server.on("close", client => {
            });

            done();
        }, e => {
            console.log(e);
        });
    });

    it("should be able to start & connect the client", function(done){

        client = new SimpleClient(clientConfig);
        client.open().then(() => {

            client.on("jmessage", message => {
                console.log("client1: " + JSON.stringify(message));

                if(message.type === "internal" && message.header === "GS:CREATE"){
                    groupId = message.content.groupId;
                }
            });

           done();
        });
    });

    it("should be able to start & connect the second client", function(done){

        clientConfig.log = (msg) => {
            console.log("client2: " + msg);
        };
        client2 = new SimpleClient(clientConfig);
        client2.open().then(() => {

            client2.on("jmessage", message => {
                console.log("client2: " + JSON.stringify(message));
            });

            done();
        });
    });

    it("should be able to send a message", function(done){
        client.send("echo", { what: "the f"}).then(r => {
            console.log(r);
            done();
        }, e => {
            console.log(e);
            expect(e).to.be.equal(undefined);
            done();
        });
    });

    it("should be able to create a group", function(done){
        client.Group.create().then(_ => {
            setTimeout(() => {
                expect(groupId).not.to.be.equal(undefined);
                done();
            }, 1000);
        });
    });

    it("should be able to leave a group", function(done){
        client.Group.leave(groupId).then(_ => {
            setTimeout(() => {
                done();
            }, 500);
        });
    });

    it("should be able to join a group", function(done){
        client.Group.join(groupId).then(_ => {
            setTimeout(() => {
                done();
            }, 500);
        });
    });

    it("should be able to join a group with second client", function(done){
        client2.Group.join(groupId).then(_ => {
            setTimeout(() => {
                done();
            }, 500);
        });
    });

    it("should be able to broadcast to all group members", function(done){
        client.Group.broadcast(groupId, {woot: "watt"}).then(_ => {
            setTimeout(() => {
                done();
            }, 1000);
        });
    });

    it("should be able to delete a group", function(done){
        client.Group.delete(groupId).then(_ => {
            setTimeout(() => {
                done();
            }, 500);
        });
    });
});
