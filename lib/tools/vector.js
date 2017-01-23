const vector = {};

vector.getVector = function(x, y, z){
    return {
        x,
        y,
        z
    };
};

vector.isVector = function(v){

    if(!v || typeof v !== "object"){
        return false;
    }

    return !(typeof v.x !== "number" ||
    typeof v.y !== "number" ||
    typeof v.z !== "number");
};

vector.areEqual = function(v1, v2){

    if(!vector.isVector(v1) ||
        !vector.isVector(v2)){
        return false;
    }

    if(v1.x !== v2.x ||
        v1.y !== v2.y ||
        v1.z !== v2.z){
        return false;
    }

    return true;
};

/*
    accuracy of 3D <=> 1D is very bad it does not work with even numbers
    for xMax and yMax, they have to be odd numbers - as well as to3D will only
    result in integer values no decimals will be covered.
 */

vector.to1D = function({x, y, z}, xMax = 111, yMax = 111){
    return (z * xMax * yMax) + (y * xMax) + x;
};

vector.to3D = function(idx, xMax = 111, yMax = 111){

    const z = (idx / (xMax * yMax)) | 0;
    idx -= (z * xMax * yMax) | 0;
    const y = (idx / xMax) | 0;
    const x = (idx % xMax) | 0;

    return {
        x,
        y,
        z
    };
};

vector.getDistanceLength = function(v1, v2){
    //length of the distance vector
    return vector.getLength(vector.getDistanceVector(v1, v2));
};

vector.getDistanceVector = function(v1, v2){
    //v1 - v2
    return vector.getVector(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
};

vector.getLength = function(v){
    //√( x2 + y2 + z2)
    return Math.sqrt(Math.pow(v.x, 2) + Math.pow(v.y, 2) + Math.pow(v.z, 2));
};

vector.worldToGridCoordinates = function(position, gridsize, isUnity3D = false) {

    let x = position.x;
    let y = isUnity3D ? position.z : position.y; //unity uses z as y

    if ( gridsize % 2 != 0 ) {
        throw new Error("gridsize not dividable by 2.");
    }

    const gridHalf = gridsize / 2;

    x = Math.floor((x + gridHalf)/gridsize);
    y = Math.floor((y + gridHalf)/gridsize);

    return vector.getVector(x, y, 0);
};

vector.gridToWorldCoordinates = function(position, gridsize, isUnity3D = false) {

    let x = position.x;
    let y = position.y;

    if ( gridsize % 2 != 0 ) {
        throw new Error("gridsize not dividable by 2.");
    }

    x = (x * gridsize);
    y = (y * gridsize);

    const vec = vector.getVector(x, 0, 0);
    if(isUnity3D){
        vec.z = y; //unity uses z as y
    } else {
        vec.y = y;
    }

    return vec;
};

vector.getVectorId = function(v){

    if(!vector.isVector(v)){
        throw new Error("passed value is not a vector, cannot get vector id.");
    }

    return `${v.x}:${v.y}:${v.z}`;
};

module.exports = vector;