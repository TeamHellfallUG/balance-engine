const expect = require("expect.js");
const ioredis = require("ioredis");

const {State} = require("./../../lib/dto/index.js");

describe("StateType INT", function(){

    it("should be able to serialise and deserialise state types into redis", function(done){

        const stateObj = {
            position: {
                x: 10.2,
                y: 5.2,
                z: 18.1
            },
            rotation: {
                x: 5.1,
                y: 9.4,
                z: 122.3
            },
            animations: [
                "one",
                "two",
                "three"
            ]
        };

        const state = new State(new ioredis(), "123");

        const ps = [];
        ps.push(state.updateState("eins", stateObj));
        ps.push(state.updateState("zwei", stateObj));
        ps.push(state.updateState("drei", stateObj));

        Promise.all(ps).then(_ => {
            state.getStatesAsList().then(list => {

                console.log(list);

                expect(list[1].animations[1]).to.be.equal(stateObj.animations[1]);

                state.erase();
                done();
            });
        });
    });

});