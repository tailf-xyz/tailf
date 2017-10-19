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

class Pub extends Socket {
  constructor(socket, options = {}) {
    super(socket);

    let { size, limit, keep_open } = options;

    Object.assign(this, { size, limit, keep_open });

    socket.on('chunk', (p, cb) => this.chunk(p, cb));
    socket.on('end', (p, cb) => this.end(p, cb));
    socket.on('join', (p, cb) => this.join(p, cb));
  }

  has_sub() {
    let { key, io } = this;

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

  // todo [akamel] there are 2 streams here... we are treating them as one
  chunk(payload = {}, cb) {
    cb();

    let { key, socket } = this;

    let { time, type, chunk } = payload;

    if (chunk) {
      let text  = chunk.toString('utf-8')
        , len   = chunk.length
        ;

      // block writes only after size is exceeded
      if (this.size > this.limit) {
        socket.disconnect(true);
        return;
      }

      this.size += len;

      let msg = Log.write(key, payload);

      // io.of('/').adapter.to(key).emit('chunk', { time, text, type });
      // socket.broadcast.to(key).emit('chunk', { time, text, type });
      // io_emitter.to(key).emit('chunk', { time, text, type });
      this
        .has_sub()
        .then((joined) => {
          if (joined) {
            if (type == 1) {
              text = `\x1b[31m${text}\x1b[m`;
            }
              // todo [akamel] this causes mem usage to keep increasing
            io_emitter.to(key).emit('chunk', { time, text, type });
          }
        });
    }
  }

  end(payload = {}, cb) {
    cb();
    let { key } = this;

    let { time, type, code } = payload;

    if (!this.keep_open) {
      Log.patch_rec(key, { end : true, code });
    }

    // io.of('/').adapter.to(key).emit('end', { time, type });
    // socket.broadcast.to(key).emit('end', { time, type });
    // io_emitter.to(key).emit('end', { time, type });
    this
      .has_sub()
      .then((joined) => {
        if (joined) {
          io_emitter.to(key).emit('end', { time, type });
        }
      });
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

  static get(socket) {
    let { sub, owner } = socket.decoded_token;

    
    return Log
            .acl(sub)
            .then((rec) => {
              let limit               = config.get('tailf.log.limit_per_file')
                , { size, keep_open } = rec
                ;

              if (!_.isInteger(size)) {
                size = 0;
              }

              return new Pub(socket, { size, limit, keep_open });
            });

    // let limit = config.get('tailf.log.limit_per_file');
    // let size = 0;
    // return new Pub(socket, { size, limit, keep_open : true});
  }
}

module.exports = Pub;
