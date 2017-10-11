'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , cache_man     = require('cache-manager')
  , Log           = require('./log')
  , { redis }     = require('./redis')
  , Socket        = require('./socket')
  ;

var io_emitter = require('socket.io-emitter')(redis);

var sub_cache = cache_man.caching({ store : 'memory', max : 10 * 1000, ttl : 5 /*seconds*/, promiseDependency : Promise });

class Sub extends Socket{
  constructor(socket, options = {}) {
    super(socket);

    socket.on('join', (payload, cb) => this.join(payload, cb));
  }

  // todo [akamel] init io here and ref it instead of expecting to have it passed in?
  join(payload = {}, cb) {
    let { replay = true }     = payload
      , { key, socket, io }   = this
      ;

    io.of('/').adapter.remoteJoin(socket.id, key, (err) => {
      if (err) {
        /* unknown id */
        return;
      }

      // todo [akamel] we might have broadcasts interleaved with catchup writes
      // or a race condigtion where we to a-c, skip d, and emit e
      if (replay) {
        Log
          .chunks(key, (msg) => {
            let { time, chunk } = msg
              , text            = chunk.toString('utf-8')
              ;

            // console.log('emitting');
            socket.emit('chunk', { time, text });
          }, (err) => {
            if (err) {
              winston.error(err);
            }

            socket.emit('end');
          });
      }

      Log
        .stats(key)
        .then((stats) => {
          cb(stats);
        });
    });
  }

  static get(socket) {
    let { sub } = socket.decoded_token;

    return Promise
            .try(() => {
              return new Sub(socket);
            });
  }
}

module.exports = Sub;
