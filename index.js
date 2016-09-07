/**
 * Created by melontron on 9/7/16.
 */
var redis = require('node-redis');
var bluebird = require('bluebird');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

var RedisPool = function (config) {
    var connections = [];
    this.methods = {
        "set" : 2,
        "get" : 2,
        "incr": 1
    };

    this.config = config;
    this.getConnection = function () {
        if (connections.length < this.config.maxPoolSize) {
            connections.push({
                client: redis.createClient(_this.config.credentials),
                id: this.makeId(),
                inUse: 1
            });
            return connections[connections.length - 1];
        } else {
            var connectionWithMinUsers = connections[0];
            var min = connections[0].inUse;
            this.connections.map(function (connection) {
                if (connection.inUse < min) {
                    min = connection.inUse;
                    connectionWithMinUsers = connection;
                }
            });
            connectionWithMinUsers.inUse++;
            return connectionWithMinUsers;
        }
    };

    this.init = function () {
        var methods = Object.keys(this.methods);
        var _this = this;
        methods.forEach(function (method) {
            switch( _this.methods[method] ){
                case 1:{
                    this[method] = function (key, callback) {
                        _this.call(method, 1, key, null, callback);
                    };
                    break;
                }
                case 2:{
                    this[method] = function (key, value, callback) {
                        _this.call(method, 2, key, value, callback);
                    };
                    break;
                }
                default:{
                    break;
                }
            }
        })
    };
    
    this.abandonConnection = function (connection) {
        if (--connection.inUse == 0) {
            this.updateConnections();
        }
    };

    this.updateConnections = function () {
        var counter = 0;
        for (var i = 0; i < connections.length; i++) {
            if (connections[i].inUse == 0) {
                counter++;
            }

            if (counter > 1) {
                connections[i].client.quit();
                connections.splice(i, 1);
                i--;
            }
        }
    };

    this.init();
};


RedisPool.prototype.call = function (method, type, key, value, callback) {
    var conn = this.getConnection();
    var client = conn.client;
    var _this = this;
    if (typeof callback == "undefined") {

        switch (type) {
            case 1:
            {
                return new Promise(function (resolve, reject) {

                    client[method + 'Async'](key).then(function (val) {
                        _this.abandonConnection(conn);
                        resolve(val)
                    }).catch(reject);
                });
            }
            case 2:
            {
                return new Promise(function (resolve, reject) {
                    client[method + 'Async'](key, value).then(function (val) {
                        _this.abandonConnection(conn);
                        resolve(val)
                    }).catch(reject);
                })

            }
        }
    } else {
        if (typeof  callback != "function") {
            throw new Error('TypeError: callback should be a function');
        } else {
            switch (type) {
                case 1:
                {
                    client[method](key, function (err, result) {
                        _this.abandonConnection(conn);
                        callback(err, result);
                    });
                    break;
                }
                case 2:
                {
                    client[method](key, value, function (err, result) {
                        _this.abandonConnection(conn);
                        callback(err, result);
                    });
                    break;
                }
            }

        }
    }
};

RedisPool.prototype.makeId = function () {

    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 10; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;

};

module.exports = RedisPool;