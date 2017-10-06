'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , Log           = require('./log')
  ;

class Stream {
  constructor(key, socket) {
    this.key = key;
    this.socket = socket;

    socket.on('join', (payload, cb) => this.join(payload, cb));
    socket.on('chunk', (payload, cb) => this.chunk(payload, cb));
    socket.on('end', (payload, cb) => this.end(payload, cb));
  }

  join(payload = {}) {
    let { replay = true } = payload
      , { key, socket }   = this
      , { io }            = socket
      ;

    socket.adapter.remoteJoin(socket.id, key, (err) => {
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

            socket.emit('chunk', { time, text });
          }, (err) => {
            winston.error(err);
          });
      }
    });
  }

  // todo [akamel] there are 2 streams here... we are treating them as one
  chunk(payload = {}, cb) {
    cb();

    let { key, socket } = this
      , { io }          = socket
      ;

    let { time, type, chunk } = payload;

    if (chunk) {
      let text  = chunk.toString('utf-8')
        , len   = chunk.length
        ;

      socket.to(key).emit('chunk', { time, text, type });

      // todo [akamel] make faster
      Log.write(key, payload);
    }
  }

  end(payload = {}, cb) {
    cb();

    let { key, socket } = this
      , { io }          = socket
      ;

    let { time, type } = payload;

    socket.to(key).emit('end', { time, type });
  }
}

module.exports = Stream;
