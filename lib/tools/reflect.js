"use strict";

const reflect = function(promise){
    return promise.then(v => ({
        v,
        status: "resolved"
    }), e => ({
        e,
        status: "rejected"
    }));
};

module.exports = reflect;