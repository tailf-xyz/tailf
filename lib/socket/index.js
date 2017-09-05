var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config-url')
  , output        = require('create-output-stream')
  , { Consumer }  = require('taskmill-core-tailf')
  , store         = require('../store')
  , { redis }     = require('../db/redis')
  ;

function consume(server) {
  return (new Consumer())
          .listen({ server })
          .then((c) => {
            function broadcast(payload) {
              let { room } = payload;

              let ws = c.io.sockets.connected[room];
              if (ws) {
                let { meta : { type }, chunk } = payload
                  , text = chunk? chunk.toString('utf-8') : null
                  ;

                ws.emit('chunk', { type, text });
                // for breadboard.io legacy code
                ws.emit('stdio', { type, text });
              }
            }

            function broadcast_end(payload) {
              let { room } = payload;
              let ws = c.io.sockets.connected[room];
              if (ws) {
                let { meta : { type } } = payload;

                ws.emit('end', { type });
                // for breadboard.io legacy code
                ws.emit('stdio', { type });
              }
            }

            c.on('connection', (socket) => {
              // todo [akamel]?
            });

            // todo [akamel] there are 2 streams here... we are treating them as one
            c.on('chunk', (payload, socket) => {
              let { id }          = socket
                , { time, chunk } = payload
                ;

              redis.setnx(id, JSON.stringify({ meta : payload.meta }));

              broadcast(payload);

              let out   = output(store.filename(id))
                , text  = chunk.toString('utf8')
                , line  = JSON.stringify({ time, text }) + '\n'
                ;

              out.write(line);
            });

            c.on('end', (payload, socket) => broadcast_end(payload));
          });
}

module.exports = {
    consume
};
