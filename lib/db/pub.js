'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , cache_man     = require('cache-manager')
  , Log           = require('./log')
  , Account       = require('./account')
  , { redis }     = require('./redis')
  , Socket        = require('./socket')
  ;

var io_emitter = require('socket.io-emitter')(redis);

var sub_cache = cache_man.caching({ store : 'memory', max : 10 * 1000, ttl : 20 /*seconds*/, promiseDependency : Promise });

class Pub extends Socket {
  constructor(socket, options = {}) {
    super(socket);

    let { size, limit, keep_open, rotate = false } = options;

    Object.assign(this, { size, limit, keep_open, rotate });

    socket.on('chunk', (p, cb) => this.chunk(p, cb));
    socket.on('end', (p, cb) => this.end(p, cb));

    // todo [akamel] is this used?
    socket.on('join', (p, cb) => this.join(p, cb));
  }

  has_sub() {
    let { key, io } = this;

    return Pub.has_sub(key, io);
  }

  // todo [akamel] there are 2 streams here... we are treating them as one
  // todo [akamel] ensure we don't have two path for writing (and checking limits)
  chunk(payload = {}, cb) {
    cb();

    let { key, io, socket, size, limit, rotate } = this;

    // this verifies that we are still connected
    if (socket) {
      let { time, type, chunk } = payload;

      if (chunk) {
        let len = chunk.length;

        // if note rotate then check size limit
        if (!rotate) {
          // block writes only after size is exceeded
          // todo [akamel] this can be abused
          if (size > limit) {
            Log.patch_rec(key, { error : 'SIZE_LIMIT' });
            socket.disconnect(true);
            return;
          }
        }

        this.size += len;

        let { chunk : text } = Log.write(key, payload, { limit });

        if (type == 1) {
          text = `\x1b[31m${text}\x1b[m`;
          }

          Pub.emit(key, io, 'chunk', { time, text, type });
        }
    }
  }

  end(payload = {}, cb) {
    cb();
    let { key, io } = this;

    let { time, type, code } = payload;

    if (!this.keep_open) {
      Log.patch_rec(key, { end : true, code });

      Pub.emit(key, io, 'end', { time, type });
    }
  }

  join(payload = {}, cb) {
    let { key, io }     = this
      , { subscribers } = payload
      ;

    Promise
      .map(subscribers, (id) => {
        return Promise
                .fromCallback((cb) => {
                  io.of('/').adapter.remoteJoin(id, key, cb);
                });
      })
      .asCallback(cb);
  }

  static has_sub(key, io) {
    return sub_cache.wrap(key, () => {
            return Promise
                    .fromCallback((cb) => {
                      io.of('/').adapter.clients([key], (err, clients) => {
                        // console.log('fetched', key, err, clients, !!_.size(clients));
                        cb(err, !!_.size(clients));
                      });
                    });
          });
  }

  static emit(key, io, name, msg) {
    // io.of('/').adapter.to(key).emit('end', { time, type });
    // socket.broadcast.to(key).emit('end', { time, type });
    // io_emitter.to(key).emit('end', { time, type });
    return Pub
            .has_sub(key, io)
            .then((joined) => {
              if (joined) {
                // todo [akamel] this causes mem usage to keep increasing
                io_emitter.to(key).emit(name, msg);
              }
            });
  }

  static get(socket) {
    let { sub, owner = '*' } = socket.decoded_token;
    return Promise
            .all([
                Log.read_rec(sub)
              , Account.read_rec(owner)
            ])
            .spread((log, account) => {
              let { size = 0, limit } = log
                , { limit_per_file }  = account
                ;

              if (_.isUndefined(limit) || limit > limit_per_file) {
                limit = limit_per_file;
              }

              return new Pub(socket, { size, limit, ...log });
            });
  }
}

module.exports = Pub;
