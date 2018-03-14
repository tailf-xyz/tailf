'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , bytes         = require('bytes')
  , randtoken     = require('rand-token')
  , { redis }     = require('./redis_index_db')
  ;

class Index {
  static add(key, data = {}, options = {}) {
    return Promise
            .try(() => {
              let { owner } = options
                , set       = undefined
                ;

              if (owner) {
                let hash = _.get(data, 'meta.hash', '*');

                set = `${owner}:${hash}`;
              }

              if (set) {
                redis.saddAsync(set, key);
              }
            });
  }

  static get(owner, options = {}) {
    let { hash } = options;

    let key = `${owner}:*`;

    if (hash) {
      key = `${owner}:${hash}`;
    }

    return redis.smembersAsync(key);
  }
}

module.exports = Index;
