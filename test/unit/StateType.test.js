const expect = require("expect.js");

const {State} = require("./../../lib/dto/index.js");

describe("StateType UNIT", function(){

    it("should be able to serialise and deserialise state types", function(done){

        const state = {
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

        expect(State.isValid(state)).to.be.equal(true);

        const buf = State.serialise(state);
        const val = State.deserialise(buf);

        console.log(buf, val);

        expect(state.animations[1]).to.be.equal(val.animations[1]);

        const sizeJson = Buffer.byteLength(JSON.stringify(state), "utf8");
        const sizeAvro = Buffer.byteLength(buf, "utf8");

        console.log(sizeJson, sizeAvro);

        expect(sizeJson > sizeAvro).to.be.equal(true);

        done();
    });

    it("should not be able to serialise and deserialise bad state types", function(done){

        const state = {
            position: {
                x: 10.2,
                z: 18.1
            },
            rotation: {
                y: 9.4,
                z: 122.3
            },
            animations: []
        };

        expect(State.isValid(state)).to.be.equal(false);

        try {
            const buf = State.serialise(state);
            const val = State.deserialise(buf);
        } catch(e){
            return done();
        }

        throw new Error("should not be reached.");
    });

});