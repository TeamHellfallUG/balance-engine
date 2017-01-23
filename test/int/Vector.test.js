const expect = require("expect.js");

const {vector} = require("./../../lib/tools/index.js");

describe("Vector UNIT", function(){

    it("should be able to map vectors", function(done){

        const vec = vector.getVector(10, 2, 3);
        const idx = vector.to1D(vec);
        const rvec = vector.to3D(idx);

        console.log(vec, idx, rvec);

        expect(vector.areEqual(vec, rvec)).to.be.equal(true);
        done();
    });

    it("should be able to compare vectors", function(done){

        const vec = vector.getVector(10, 2, 3);
        const vec2 = vector.getVector(10, 2, 3);
        const vec3 = vector.getVector(5, 1, 1.5);

        expect(vector.isVector(vec)).to.be.equal(true);
        expect(vector.isVector({z:12})).to.be.equal(false);
        expect(vector.areEqual(vec, vec2)).to.be.equal(true);
        expect(vector.areEqual(vec2, vec3)).to.be.equal(false);
        done();
    });

    it("should be able to calculate distance between vectors", function(done){
        const vec1 = vector.getVector(5.2, 4.9, 12.2);
        const vec2 = vector.getVector(3.1, 4.2, 10.1);
        const dVec = vector.getDistanceVector(vec1, vec2);
        const distance = vector.getLength(dVec);
        const distance2 = vector.getDistanceLength(vec1, vec2);

        console.log(vec1, vec2, dVec, distance, distance2);

        expect(distance).to.be.equal(distance2);
        done();
    });
});