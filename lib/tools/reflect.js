
const reflect = function(promise){
    return promise.then(r => ({
        v: r,
        status: "resolved"
    }), e => ({
        e,
        status: "rejected"
    }));
};

module.exports = reflect;