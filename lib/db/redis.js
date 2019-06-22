var _             = require('lodash')
  , Promise       = require('bluebird')
  , config_redis  = require('config-redis')
  , redis         = require('redis')
  ;

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

let redis_client = redis.createClient(config_redis.options('tailf.redis'));

module.exports = {
    redis   : redis_client
};
