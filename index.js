#!/usr/bin/env node

const pkg = require('./package.json');
const log = require('yalm');
const config = require('yargs')
    .env('SIMPLEHMIP2MQTT')
    .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
    .describe('verbosity', 'possible values: "error", "warn", "info", "debug"')
    .describe('name', 'instance name. used as mqtt client id and as prefix for connected topic')
    .describe('mqtt-url', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
    .describe('polling-interval', 'polling interval (in ms) for status updates')
    .describe('ccu-address', 'CCU address')
    .describe('init-address', 'Own IP for callbacks')
    .describe('listen-port', 'Own Port for callbacks')
    .describe('filter-whitelist', 'Publish only Homematic Datapoints that match any regular expression defined here. Specify multiple regex strings seperated by space, for e.g.: "^PRESS_ ^BRIGHTNESS$"')
    .describe('filter-blacklist', 'Similar to --filter-whitelist. Homematic Datapoints that match any regular expression defined here, won\'t be published. Specify multiple regex strings seperated by space, for e.g.: "^PARTY_"')
    .alias({
        h: 'help',
        m: 'mqtt-url',
        c: 'ccu-address',
        i: 'init-address',
        p: 'listen-port',
        v: 'verbosity'
    })
    .default({
        name: 'hmip',
        'mqtt-url': 'mqtt://127.0.0.1',
        'polling-interval': 3000,
        'listen-port': 3126
    })
    .version()
    .help('help')
    .argv;
const MqttSmarthome = require('mqtt-smarthome-connect');
const xmlrpc = require('homematic-xmlrpc');
const shortid = require('shortid');
const Timer = require('yetanothertimerlibrary');

log.setLevel(config.verbosity);
log.info(pkg.name + ' ' + pkg.version + ' starting');
log.debug("loaded config: ", config);

var filter_whitelist = [];
if (typeof config.filterWhitelist === 'string') {
    config.filterWhitelist.split(' ').forEach(rx => {
        filter_whitelist.push(new RegExp(rx));
    });
}
var filter_blacklist = [];
if (typeof config.filterBlacklist === 'string') {
    config.filterBlacklist.split(' ').forEach(rx => {
        filter_blacklist.push(new RegExp(rx));
    });
}

log.info('mqtt trying to connect', config.mqttUrl);
const mqtt = new MqttSmarthome(config.mqttUrl, {
    logger: log,
    will: {topic: config.name + '/maintenance/_bridge/online', payload: 'false', retain: true}
});
mqtt.connect();

const server = xmlrpc.createServer({
    host: '0.0.0.0',
    port: config.listenPort
});
const client = xmlrpc.createClient({
    host: config.ccuAddress,
    port: 2010,
    path: '/'
});
const ownid = pkg.name + '_' + shortid.generate();

function methodCall(method, parameters) {
    return new Promise((resolve, reject) => {
        client.methodCall(method, parameters, (error, value) => {
            if ( error ) {
                reject(error);
            } else {
                resolve(value);
            }
        });
    });
}

mqtt.on('connect', () => {
    log.info('mqtt connected', config.mqttUrl);
    mqtt.publish(config.name + '/maintenance/_bridge/online', 'true', {retain: true});
});

const rpcMethods = {
    notFound: method => {
        log.debug('rpc < Method ' + method + ' does not exist');
    },
    'system.multicall': (err, params, callback) => {
        if (err) {
            log.error(err);
            return;
        }
        const res = [];
        params[0].forEach(c => {
            if (rpcMethods[c.methodName]) {
                rpcMethods[c.methodName](err, c.params);
            } else {
                rpcMethods.notFound(c.methodName, c.params);
            }
            res.push('');
        });
        callback(null, res);
    },
    'system.listMethods': (err, params, callback) => {
        if (err) {
            log.error(err);
            return;
        }
        log.debug('rpc < system.listMethods', params);
        callback(null, Object.keys(rpcMethods));
    },
    event: (err, params, callback) => {
        if (err) {
            log.error(err);
            return;
        }
        log.debug('rpc < event', JSON.stringify(params));

        if (params[1] === 'CENTRAL' && params[2] === 'PONG') {
            if (typeof callback === 'function') {
                callback(null, '');
            }
            return;
        }

        const address = params[1];
        const serial = address.substr(0, address.indexOf(':'));
        const channel = address.substr(address.indexOf(':')+1);
        const datapoint = params[2];
        const value = params[3];

        if ( 
            !filter_blacklist.some(rx => rx.test(datapoint)) &&
            (filter_whitelist.some(rx => rx.test(datapoint)) || filter_whitelist.length == 0 )
        ) {
            mqtt.publish(config.name+'/status/'+serial+'/'+channel+'/'+datapoint, value, {retain: true});
        }

        if (typeof callback === 'function') {
            callback(null, '');
        }
    },
    listDevices: (err, params, callback) => {
        if (err) {
            log.error(err);
            return;
        }
        log.debug('rpc < listDevices', params);
        log.debug('>', 0);
        /* At least for the CCU2 (FW 2.35.16) the connection doesn't work without implementing `listDevices` method. However the CCU2 doesn't care if we return just an empty array.
         */
        callback(null, []);
    }
};
Object.keys(rpcMethods).forEach(method => {
    server.on(method, rpcMethods[method]);
});

mqtt.subscribe(config.name + "/set/+/+/+", (topic, message, wildcard) => {
    const serial = wildcard[0];
    const channel = wildcard[1];
    const datapoint = wildcard[2];

    log.debug('rpc > setValue', serial, channel, datapoint, message);

    /* 
        For Homematic Classic's rfd it's possible to simply wrap the message in String(message) - see [this line](https://github.com/dersimn/simplehmrfd2mqtt/blob/40038dd7c038c2f8c2677a74928621471a789cdd/index.js#L162). The CCU exrtacted the proper value from this string no matter if the actual datatype of datapoint is string, boolean, enum or whatever.
        Homematic IP's crRFD doesn't like this 'hack'. Sending the plain value might cause troubles when dealing with float values, because JavaScript doesn't make a difference between int/float. I currently have no device that expects a float value, to test this behaviour.
     */
    methodCall('setValue', [serial+':'+channel, datapoint, message]).catch(err => {
        log.error(err);
    });
});

log.info('rpc', '> init');
methodCall('init', ['http://'+config.initAddress+':'+config.listenPort, ownid]).catch(err => {
    log.error(err);
});
var pingpong = new Timer(() => {
    let id = shortid.generate();

    log.debug('rpc > ping', id);
    methodCall('ping', [id]).catch(err => {
        log.error(err);
    });
}).start(30*1000);

function stop() {
    log.info('rpc', '> stop');
    methodCall('init', ['http://'+config.initAddress+':'+config.listenPort, '']).catch(err => {
        log.error(err);
    });
    process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
