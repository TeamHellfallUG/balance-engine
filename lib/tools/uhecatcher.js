"use strict";

function registerUHECatcher(logFunc) {

    if(typeof logFunc !== "function"){
        throw new Exception("registerUHECatcher requires a valid function as logFunc argument.");
    }

    if (!("toJSON" in Error.prototype)) {
        Object.defineProperty(Error.prototype, "toJSON", {
            value: function () {
                const alt = {};

                Object.getOwnPropertyNames(this).forEach(function (key) {
                    alt[key] = this[key];
                }, this);

                return alt;
            },
            configurable: true,
            writable: true
        });
    }

    process.on("uncaughtException", err => {
        logFunc(`Caught exception: ${JSON.stringify(err)}`);
    });

    process.on("unhandledRejection", (reason, p) => {
        logFunc(`Unhandled Promise Rejection: ${JSON.stringify(reason)}`);
    });

    process.on("warning", warning => {
        logFunc(`Warning message: ${warning.message}`);
    });
}

module.exports = registerUHECatcher;
