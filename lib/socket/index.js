var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config-url')
  , winston       = require('winston')
  , Log           = require('../db/log')
  , io_redis      = require('socket.io-redis')
  , { Consumer }  = require('taskmill-core-tailf')
  , { redis }     = require('../db/redis')
  ;

function line_to_msg(line) {
  let { time, text, type }  = line;

  return { time, text, type };
}

function consume(server) {
  return (new Consumer())
          .listen({ server })
          .then((c) => {
            let { io } = c;

            let { host, port }  = config.getUrlObject('tailf.redis')
              , db              = config.get('tailf.redis.db')
              , password        = config.get('tailf.redis.password')

            io.adapter(io_redis({ host, port, db, password }));

            function broadcast(room, data = {}) {
              io.to(room).emit('chunk', line_to_msg(data));
            }

            function broadcast_end(room, data = {}) {
              let { time, type }  = data
                , msg             = { time, type }
                ;

              io.to(room).emit('end', msg);
            }

            c.on('disconnect', (socket) => {
              winston.info('disconnect', socket.id);
            });

            c.on('connection', (socket) => {
              winston.info('connection', socket.id);

              // todo [akamel]?
              socket.rooms = [];

              socket.on('join', (payload = {}) => {
                let { room } = payload

                // socket.rooms[room] = room;
                io.of('/').adapter.remoteJoin(socket.id, room, (err) => {
                  if (err) {
                    /* unknown id */
                    return;
                  }
                  // todo [akamel] we might have broadcasts interleaved with catchup writes
                  // or a race condigtion where we to a-c, skip d, and emit e
                  Log
                    .get(room)
                    .then((log) => {
                      log
                        .chunks((chunk) => {
                          socket.emit('chunk', line_to_msg(chunk));
                        }, () => {});
                    });
                });
              });
            });

            // todo [akamel] there are 2 streams here... we are treating them as one
            // todo [akamel] we are trusting the room that is sent
            c.on('chunk', (payload = {}, socket) => {
              let { time, type, chunk, meta, spec, room } = payload
                , text = undefined
                ;

              if (chunk) {
                text = chunk.toString('utf-8');
              }

              if (!room) {
                room = socket.id;
              }

              broadcast(room, { time, text, type });

              let rec  = { spec, meta };

              Log
                .acl(room, socket.id, { rec })
                .tap((log) => {
                  return log.inc_size(chunk.length);
                })
                .tap((size) => {
                  if (size >= config.get('tailf.log.max_size')) {
                    throw new Error('file size limit');
                  }
                })
                .tap((log) => {
                  return log.write(payload);
                })
                // todo [akamel] catch error
                ;

            });

            c.on('end', (payload = {}, socket) => {
              let { time, type, room } = payload;

              if (!room) {
                room = socket.id;
              }

              Log
                .acl(room, socket.id)
                .then((log) => {
                  broadcast_end(room, { time, type })
                })
            });
          });
}

module.exports = {
    consume
};
