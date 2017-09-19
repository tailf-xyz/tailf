var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config-url')
  , winston       = require('winston')
  , Log           = require('../db/log')
  , Account       = require('../db/account')
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
              // winston.info('disconnect', socket.id);
            });

            c.on('connection', (socket) => {
              // todo [akamel] do auth on connect, not on each write...
              // winston.info('connection', socket.id);

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
              let { time, type, chunk, meta, spec, room, owner, token } = payload
                , text = undefined
                ;

              if (!owner) {
                owner = token;
              }

              if (chunk) {
                text = chunk.toString('utf-8');
              }

              if (!room) {
                room = socket.id;
              }

              broadcast(room, { time, text, type });

              if (chunk) {
                let rec   = { spec, meta }
                  , len   = chunk.length
                  ;

                // Log
                //   .acl(room, { rec, on : socket.id, by : owner })
                //   .tap((log) => {
                //     return Account
                //             .get(owner)
                //             .then((account) => {
                //               let add                       = len
                //                 , { limit, limit_per_file } = account
                //                 ;
                //
                //                 return log
                //                         .read_size()
                //                         .then((size) => {
                //                           // winston.info(size, add, size+add, limit_per_file);
                //                           if ((size + add) > limit_per_file) {
                //                             winston.info(`file size limit: ${room} is ${size} and owner ${account.id} is limited to ${limit_per_file}`);
                //                             throw new Error('file size limit');
                //                           }
                //
                //                           return account.read_size();
                //                         })
                //                         .then((usage) => {
                //                           if (limit) {
                //                             if ((usage + add) > limit) {
                //                               winston.info(`account limit: ${account.id} is ${usage} and is limited to ${limit}`);
                //                               throw new Error('account limit');
                //                             }
                //                           }
                //                         });
                //             });
                //   })
                log
                  .get(key)
                  .tap((log) => {
                    return log.write(payload);
                  })
                  // .tap((log) => {
                  //   return log.inc_size(len);
                  // })
                  .catch((err) => {
                    if (err.message == 'key mismatch') {
                      return;
                    }

                    winston.error(err);
                  });
              }
            });

            c.on('end', (payload = {}, socket) => {
              let { time, type, room, owner } = payload;

              if (!room) {
                room = socket.id;
              }

              // Log
              //   .acl(room, { 'on' : socket.id, by : owner })
              //   .then((result = {}) => {
              //     let { log, account } = result;
              Log
                .get(key)
                .then((log) => {
                  broadcast_end(room, { time, type })
                })
                .catch((err) => {
                  if (err.message == 'key mismatch') {
                    return;
                  }

                  winston.error(err);
                });
            });
          });
}

module.exports = {
    consume
};
