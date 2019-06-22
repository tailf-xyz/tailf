var Promise       = require('bluebird')
  , config        = require('config')
  , ms            = require('ms')
  ;

class Account {
  static read_rec(key) {
    // key is token
    return Promise
            .try(() => {
              return config.get(`tailf.metering.${key}`);
            })
            .catch(() => {
              return config.get('tailf.metering.*');
            })
            .then(({ name, limit_per_file, limit_metadata, ttl }) => {
              return { name, limit_per_file, limit_metadata, ttl };
            })
  }
}

module.exports = Account;
