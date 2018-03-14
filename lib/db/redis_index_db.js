var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config-url')
  , redis         = require('redis')
  ;

// redis.debug_mode = true;

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

let redis_opts = {
    db              : config.get('tailf.redis.db_index')
  , host            : config.getUrlObject('tailf.redis').host
  , port            : config.getUrlObject('tailf.redis').port
};

if (config.has('tailf.redis.password')) {
  let password = config.get('tailf.redis.password');
  if (!_.isEmpty(password)) {
    redis_opts.password = password;
  }
}

let redis_client = redis.createClient(redis_opts);

module.exports = {
    redis   : redis_client
};
