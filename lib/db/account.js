'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , bytes         = require('bytes')
  , randtoken     = require('rand-token')
  , { redis }     = require('./redis')
  , lru_cache     = require('lru-cache')
  , stripe        = require("stripe")("sk_test_HgwId1ll0GJiimY7Ugseu2iV")
  ;

var cache = lru_cache({ max : 1000, maxAge : 5 * 60 * 1000 });

class Account {
  // constructor(id, rec) {
  //   this.id = id;
  //   this.rec = rec;
  //
  //   this.limit = rec.limit;
  //   this.limit_per_file = rec.limit_per_file;
  // }

  // static stats(key) {
  //   return Log.read_rec(key);
  // }

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

  // static inc_size(key, inc) {
  //   return redis
  //           .hincrbyAsync(`${key}`, 'size', inc)
  //           .tap((size) => {
  //             // if (!cache.has(key)) {
  //             //   cache.set(key, {});
  //             // }
  //             //
  //             // cache.get(key).size = size;
  //           });
  // }
  //
  // static get(key) {
  //   return Promise
  //           .try(() => {
  //             if (!key) {
  //               let limit_per_file  = config.get('tailf.metering.*.limit_per_file')
  //                 , limit           = 0
  //                 ;
  //
  //               return new Account('anonymous', { limit, limit_per_file });
  //             }
  //
  //             if (cache.has(key)) {
  //               return cache.get(key);
  //             }
  //
  //             return redis
  //                     .getAsync(`account:${key}`)
  //                     .then((str) => {
  //                       if (!str) {
  //                         throw new Error('rec not found');
  //                       }
  //
  //                       return JSON.parse(str);
  //                     })
  //                     .then((rec) => {
  //                       return new Account(key, rec);
  //                     });
  //           });
  // }
  //
  // static make(data = {}) {
  //   return Promise
  //           .try(() => {
  //             let { limit, limit_per_file, email, ...meta } = data;
  //
  //             return stripe
  //                     .customers
  //                     .create({ email })
  //                     .then((customer) => {
  //                       let key   = randtoken.generate(32)
  //                         , date  = new Date().getTime()
  //                         , rec   = { key, date, limit, limit_per_file, email, stripe : customer, meta }
  //                         , str   = JSON.stringify(rec)
  //                         ;
  //
  //                       return redis
  //                               .setnxAsync(`account:${key}`, str)
  //                               .then((res) => {
  //                                 if (res == 0) {
  //                                   throw new Error('key collision');
  //                                 }
  //
  //                                 return new Account(key, rec);
  //                               });
  //                     });
  //
  //           });
  // }
}

module.exports = Account;
