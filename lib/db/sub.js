'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , through2      = require('through2')
  , through2_sink = require('through2-sink')
  , capped        = require('cappedarray')
  , config        = require('config')
  , winston       = require('winston')
  , cache_man     = require('cache-manager')
  , Log           = require('./log')
  , { redis }     = require('./redis')
  , Socket        = require('./socket')
  ;

// var io_emitter = require('socket.io-emitter')(redis);

// var sub_cache = cache_man.caching({ store : 'memory', max : 10 * 1000, ttl : 5 /*seconds*/, promiseDependency : Promise });

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
          .reader(key)
          .then((stream) => {
            let c = capped(40);

            stream
              .pipe(through2.obj((msg, enc, callback) => {
                let { type, time, chunk } = msg;

                let text = chunk.toString('utf-8');

                if (type == 1) {
                  text = `\x1b[31m${text}\x1b[m`;
                }

                c.push({ time, text });

                callback()
              }))
              .on('end', () => {
                _.each(c, (msg) => socket.emit('chunk', msg))
              })
              .pipe(through2_sink.obj());
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
    return Promise
            .try(() => {
              return new Sub(socket);
            });
  }
}

module.exports = Sub;
