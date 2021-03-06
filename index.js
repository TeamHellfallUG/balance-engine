"use strict";

const Server = require("./lib/Server.js");
const WSProxy = require("./lib/balance/WSProxy.js");
const UDPProxy = require("./lib/balance/UDPProxy.js");
const GroupServer = require("./lib/GroupServer.js");
const JsonMessageLayerServer = require("./lib/JsonMessageLayerServer.js");
const VectorGroupServer = require("./lib/VectorGroupServer.js");
const RoomGroupServer = require("./lib/RoomGroupServer.js");

const ServiceRegistry = require("./lib/http/ServiceRegistry.js");
const ServiceRegistryClient = require("./lib/http/ServiceRegistryClient.js");

const SimpleClient = require("./client/Simple.js");

module.exports = {
    Server,
    WSProxy,
    UDPProxy,
    GroupServer,
    JsonMessageLayerServer,
    SimpleClient,
    VectorGroupServer,
    RoomGroupServer,
    ServiceRegistry,
    ServiceRegistryClient
};