const expect = require("expect.js");

const {RoomGroupServer, SimpleClient} = require("./../../index.js");
const config = require("./test-config.json");

describe("RoomServer Integration", function(){

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
    let client3 = null;
    let client4 = null;
    let client5 = null;

    it("should be able to start the room group server", function(done){

        server = new RoomGroupServer(serverConfig);
        server.open().then(() => {

            server.on("connection", client => {
            });

            server.on("jmessage", (clientId, message) => {
            });

            server.on("close", client => {
            });

            //let this server instance take care of the match making queue
            //server.runMatchmaking(); //-> lets call this manually for the test

            done();
        }, e => {
            console.log(e);
        });
    });

    it("should be able to start & connect the client", function(done){

        client = new SimpleClient(clientConfig);
        client.stateUpdates = 0;
        client.open().then(() => {

            client.on("jmessage", message => {
                console.log("client1: " + JSON.stringify(message));

                if(message.type === "internal"){

                    if(message.header === client.RG_IMSG.CONFIRM){
                        console.log("client1 received confirm, sending confirm.");
                        client.Room.confirm(message.content.matchId).then(_ => {});
                    }

                    if(message.header === client.RG_IMSG.START){
                        console.log("client1 server send start packet for match.");
                        client.matchStarted = true;
                    }

                    if(message.header === client.RG_IMSG.STATE_UPDATE){
                        client.stateUpdates++;
                        client.lastState = message.content.states;
                    }

                    if(message.header === client.RG_IMSG.END){
                        client.matchEnded = true;
                    }
                }
            });

            client.Room.search().then(_ => {
                done();
            });
        });
    });

    it("should be able to start & connect the second client", function(done){

        clientConfig.log = (msg) => {
            console.log("client2: " + msg);
        };
        client2 = new SimpleClient(clientConfig);
        client2.stateUpdates = 0;
        client2.open().then(() => {

            client2.on("jmessage", message => {
                console.log("client2: " + JSON.stringify(message));

                if(message.type === "internal"){

                    if(message.header === client.RG_IMSG.CONFIRM){
                        console.log("client2 received confirm, sending confirm.");
                        client2.Room.confirm(message.content.matchId).then(_ => {});
                    }

                    if(message.header === client.RG_IMSG.START){
                        console.log("client2 server send start packet for match.");
                        client2.matchStarted = true;
                    }

                    if(message.header === client.RG_IMSG.STATE_UPDATE){
                        client2.stateUpdates++;
                        client2.lastState = message.content.states;
                    }

                    if(message.header === client.RG_IMSG.END){
                        client2.matchEnded = true;
                    }
                }
            });

            client2.Room.search().then(_ => {
                done();
            });
        });
    });

    it("should be able to start & connect the third client", function(done){

        clientConfig.log = (msg) => {
            console.log("client3: " + msg);
        };
        client3 = new SimpleClient(clientConfig);
        client3.stateUpdates = 0;
        client3.open().then(() => {

            client3.on("jmessage", message => {
                console.log("client3: " + JSON.stringify(message));

                if(message.type === "internal"){

                    if(message.header === client.RG_IMSG.CONFIRM){
                        console.log("client3 received confirm, sending confirm.");
                        client3.Room.confirm(message.content.matchId).then(_ => {});
                    }

                    if(message.header === client.RG_IMSG.START){
                        console.log("client3 server send start packet for match.");
                        client3.matchStarted = true;
                    }

                    if(message.header === client.RG_IMSG.STATE_UPDATE){
                        client3.stateUpdates++;
                        client3.lastState = message.content.states;
                    }

                    if(message.header === client.RG_IMSG.END){
                        client3.matchEnded = true;
                    }
                }
            });

            client3.Room.search().then(_ => {
                done();
            });
        });
    });

    it("should be able to start & connect the forth client", function(done){

        clientConfig.log = (msg) => {
            console.log("client4: " + msg);
        };
        client4 = new SimpleClient(clientConfig);
        client4.stateUpdates = 0;
        client4.open().then(() => {

            client4.on("jmessage", message => {
                console.log("client4: " + JSON.stringify(message));

                if(message.type === "internal"){

                    if(message.header === client.RG_IMSG.CONFIRM){
                        console.log("client4 received confirm, sending confirm.");
                        client4.Room.confirm(message.content.matchId).then(_ => {});
                    }

                    if(message.header === client.RG_IMSG.START){
                        console.log("client4 server send start packet for match.");
                        client4.matchStarted = true;
                    }

                    if(message.header === client.RG_IMSG.STATE_UPDATE){
                        client4.stateUpdates++;
                        client4.lastState = message.content.states;
                    }

                    if(message.header === client.RG_IMSG.END){
                        client4.matchEnded = true;
                    }
                }
            });

            client4.Room.search().then(_ => {
                done();
            });
        });
    });

    it("should be able to start & connect the fifth client", function(done){

        clientConfig.log = (msg) => {
            console.log("client5: " + msg);
        };
        client5 = new SimpleClient(clientConfig);
        client5.stateUpdates = 0;
        client5.open().then(() => {

            client5.on("jmessage", message => {
                console.log("client5: " + JSON.stringify(message));

                if(message.type === "internal"){

                    if(message.header === client.RG_IMSG.CONFIRM){
                        console.log("client5 received confirm, sending confirm.");
                        client5.Room.confirm(message.content.matchId).then(_ => {});
                    }

                    if(message.header === client.RG_IMSG.START){
                        console.log("client5 server send start packet for match.");
                        client5.matchStarted = true;
                    }

                    if(message.header === client.RG_IMSG.STATE_UPDATE){
                        client5.stateUpdates++;
                        client5.lastState = message.content.states;
                    }

                    if(message.header === client.RG_IMSG.END){
                        client5.matchEnded = true;
                    }
                }
            });

            client5.Room.search().then(_ => {
                done();
            });
        });
    });

    it("awaiting packets..(mm search)", function(done){
        setTimeout(done, 200);
    });

    it("should be able to broadcast a message", function(done){
        client.Room.broadcast({ what: "the f"}).then(r => {
            console.log(r);
            done();
        }, e => {
            console.log(e);
            expect(e).to.be.equal(undefined);
            done();
        });
    });

    it("awaiting packets..(mm broadcast)", function(done){
        setTimeout(done, 200);
    });

    it("should be able to run match-making manually", function(done){
        server.executeMatchMakingLogic().then(_ => {
           done();
        }).catch(e => {
            console.log(e);
            //dont call done here..
        });
    });

    it("awaiting packets..(mm confirmation)", function(done){
        setTimeout(done, 200);
    });

    it("should be able to broadcast a message", function(done){
        client2.Room.broadcast({ what: "the f 2"}).then(r => {
            console.log(r);
            done();
        }, e => {
            console.log(e);
            expect(e).to.be.equal(undefined);
            done();
        });
    });

    it("awaiting packets..(mm broadcast)", function(done){
        setTimeout(done, 200);
    });

    it("should be able to execute mm confirmation logic manually", function(done){
        server.executeMatchConfirmationLogic().then(_ => {
            done();
        }).catch(e => {
            console.log(e);
            //dont call done here..
        });
    });

    it("awaiting packets..(mm start)", function(done){
        setTimeout(done, 200);
    });

    it("should see the correct match status on clients", function(done){

        expect(client.matchStarted).to.be.equal(undefined);
        expect(client2.matchStarted).to.be.equal(undefined);

        expect(client3.matchStarted).to.be.equal(true);
        expect(client4.matchStarted).to.be.equal(true);
        expect(client5.matchStarted).to.be.equal(true);

        done();
    });

    it("should be able to send client updates to the server", function(done){

        client5.Room.stateUpdate(SimpleClient.buildState(
            SimpleClient.getVector(10,15,20),
            SimpleClient.getVector(5,6,7),
            [ "run", "shoot"]
        ));

        client4.Room.stateUpdate(SimpleClient.buildState(
            SimpleClient.getVector(10,15,20),
            SimpleClient.getVector(5,6,7),
            [ "run", "shoot"]
        ));

        client3.Room.stateUpdate(SimpleClient.buildState(
            SimpleClient.getVector(10,15,20),
            SimpleClient.getVector(5,6,7),
            [ "run", "shoot"]
        ));

        client5.Room.stateUpdate(SimpleClient.buildState(
            SimpleClient.getVector(20,15,10),
            SimpleClient.getVector(5,6,7),
            [ "sit" ]
        ));

        done();
    });

    it("awaiting packets..(sul states)", function(done){
        setTimeout(done, 200);
    });

    it("should have received state update messages by now", function(done){

        expect(client.stateUpdates).to.be.equal(0);
        expect(client2.stateUpdates).to.be.equal(0);

        expect(client3.stateUpdates).not.to.be.equal(0);
        expect(client4.stateUpdates).not.to.be.equal(0);
        expect(client5.stateUpdates).not.to.be.equal(0);

        console.log(client4.lastState);
        done();
    });

    it("await packets.. (match end)", function(done){
        this.timeout(config.server.sulDuration + 300);
        setTimeout(done, config.server.sulDuration + 200);
    });

    it("should see end packets @ clients", function(done){

        expect(client.matchEnded).to.be.equal(undefined);
        expect(client2.matchEnded).to.be.equal(undefined);

        expect(client3.matchEnded).not.to.be.equal(true);
        expect(client4.matchEnded).not.to.be.equal(true);
        expect(client5.matchEnded).not.to.be.equal(true);

        console.log(client3.stateUpdates, client4.stateUpdates, client5.stateUpdates);

        expect(client3.stateUpdates).to.be.equal(client4.stateUpdates);
        expect(client4.stateUpdates).to.be.equal(client5.stateUpdates);

        done();
    });

    it("await final packets..", function(done){
        setTimeout(() => {
            client.close();
            client2.close();
            client3.close();
            client4.close();
            client5.close();
            setTimeout(() => {
                server.close();
                done();
            }, 400);
        }, 800);
    });
});
