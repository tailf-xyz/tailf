var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , redisscan     = require('redisscan')
  , { redis }     = require('../../lib/db/redis')
  ;

function find(cb) {
  let arr = [];
  redisscan({
      redis
    // pattern: 'awesome:key:prefix:*',
    , keys_only: false
    , each_callback : (type, key, subkey, length, value, cb) => {
      if (type == 'string') {
        arr.push({ type, key, subkey, length, value });
      }

      cb();
    }
    , done_callback : (err) => cb(err, arr)
  });
}

Promise
  .fromCallback((cb) => find(cb))
  .then((rows) => {
    let keys = _.map(rows, (r) => r.key);
    return redis.delAsync(keys);
  })
  .catch((err) => {
    winston.error(err);
  })
  .finally(() => {
    process.exit();
  })
