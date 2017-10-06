'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , randtoken     = require('rand-token')
  , { redis }     = require('./redis')
  , lru_cache     = require('lru-cache')
  , stripe        = require("stripe")("sk_test_HgwId1ll0GJiimY7Ugseu2iV")
  ;

var cache = lru_cache({ max : 1000, maxAge : 5 * 60 * 1000 });

class Account {
  constructor(id, rec) {
    this.id = id;
    this.rec = rec;

    this.limit = rec.limit;
    this.limit_per_file = rec.limit_per_file;
  }

  key() {
    return `${this.id}`;
  }

  // acl() {
  //   return Account.acl(this.id);
  // }

  read_size() {
    if (this.id == 'anonymous') {
        return Promise.resolve(0);
    }

    let key = `size:account:${this.key()}`;
    return redis.getAsync(key).then(Number.parseInt);;
  }

  inc_size(inc) {
    let key = `size:account:${this.key()}`;
    return redis.incrbyAsync(key, inc);
  }

  stats() {
    return Promise
            .all([ this.rec, this.read_size() ])
            .spread((rec, size) => {
              if (!rec) {
                throw new Error('not found')
              }

              let { key } = rec;
              return {
                  key
                , rec
                , size
              };
            })
  }

  static get(key) {
    return Promise
            .try(() => {
              if (!key) {
                let limit_per_file  = config.get('tailf.log.limit_per_file')
                  , limit           = 0
                  ;

                return new Account('anonymous', { limit, limit_per_file });
              }

              if (cache.has(key)) {
                return cache.get(key);
              }

              return redis
                      .getAsync(`account:${key}`)
                      .then((str) => {
                        if (!str) {
                          throw new Error('rec not found');
                        }

                        return JSON.parse(str);
                      })
                      .then((rec) => {
                        return new Account(key, rec);
                      });
            });
  }

  static make(data = {}) {
    return Promise
            .try(() => {
              let { limit, limit_per_file, email, ...meta } = data;

              return stripe
                      .customers
                      .create({ email })
                      .then((customer) => {
                        let key   = randtoken.generate(32)
                          , date  = new Date().getTime()
                          , rec   = { key, date, limit, limit_per_file, email, stripe : customer, meta }
                          , str   = JSON.stringify(rec)
                          ;

                        return redis
                                .setnxAsync(`account:${key}`, str)
                                .then((res) => {
                                  if (res == 0) {
                                    throw new Error('key collision');
                                  }

                                  return new Account(key, rec);
                                });
                      });

            });
  }
}

module.exports = Account;
