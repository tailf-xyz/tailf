'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , { logger }    = require('./lib/logger')
  ;

class Socket {
  constructor(socket) {
    let { decoded_token : { sub }, server : io } = socket;

    this.socket = socket;

    this.io = io;
    this.key = sub;

    socket.on('disconnect', () => {
      delete this.socket;
      delete this.io;

      socket.removeAllListeners();

      logger.info('disconnect', sub, socket.id);
    });
  }
}

module.exports = Socket;
