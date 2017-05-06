const expect = require("expect.js");

const {ServiceRegistry, ServiceRegistryClient} = require("./../../index.js");
const config = require("./test-config.json");

describe("ServiceRegistry/Client Integration", function(){

    let registry = null;
    let client = null;

    const service = {
        name: "straeter",
        zone: "us-central1-c",
        host: "192.168.1.2",
        ports: {
            tcp: 1337,
            udp: 1447
        }
    };

    before(function(done){
        done();
    });

    after(function(done){
        client.close();
        registry.close();
        done();
    });

    it("should be able to start the registry server", function(){

        registry = new ServiceRegistry({
            port: config.registry.port,
            redisConfig: config.server.redis,
            authorization: config.registry.authorization
        });

        client = new ServiceRegistryClient(config.registry);

        return registry.start();
    });

    it("should be able to register service", function(){

        return client.register(service.name, service.zone, service.host, service.ports).then(result => {
            console.log(result);
            return true;
        });
    });

    it("should be able to get service list from registry", function(){

        return client.list("*").then(list => {
            console.log(list);
            expect(list[0].host).to.be.equal(service.host);
            return true;
        });
    });
});
