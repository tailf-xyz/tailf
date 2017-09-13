var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config-url')
  , winston       = require('winston')
  , Log           = require('../db/log')
  , { Consumer }  = require('taskmill-core-tailf')
  , { redis }     = require('../db/redis')
  ;

function find_sub(sockets, room) {
  let ret = [];

  // 1. find sub by id
  // todo [akamel] consider replace with 'sub' logic
  let ws = sockets[room];
  if (ws) {
    ret.push(ws);
  }

  // 2. find other subs
  let subs = _
              .chain(sockets)
              .filter((socket) => !!socket.rooms[room])
              .value()
              ;

  ret.push(...subs);

  return ret;
}

function consume(server) {
  return (new Consumer())
          .listen({ server })
          .then((c) => {
            function broadcast(room, data = {}) {
            // function broadcast(payload) {
              let subs = find_sub(c.io.sockets.connected, room);
              if (_.size(subs)) {
                let { time, text, type }  = data
                  , msg                   = { time, text, type }
                  ;

                _.each(subs, (sub) => {
                  sub.emit('chunk', msg);
                  // for breadboard.io legacy code
                  sub.emit('stdio', msg);
                });
              }
            }

            function broadcast_end(room, data = {}) {
              let subs = find_sub(c.io.sockets.connected, room);
              if (_.size(subs)) {
                let { time, type }  = data
                  , msg             = { time, type }
                  ;

                _.each(subs, (sub) => {
                  sub.emit('end', msg);
                  // for breadboard.io legacy code
                  sub.emit('stdio', msg);
                });
              }
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
                socket.rooms[room] = room;

                // todo [akamel] we might have broadcasts interleaved with catchup writes
                Log.get(room)
                      .chunks((chunk) => {
                        broadcast(room, chunk);
                      }, () => {})
              });
            });

            // todo [akamel] there are 2 streams here... we are treating them as one
            // todo [akamel] we are trusting the room that is sent
            c.on('chunk', (payload = {}, socket) => {
              let { time, type, chunk, meta = {}, spec = {} } = payload;

              let room = socket.id
                , text = chunk? chunk.toString('utf-8') : null
                ;

              broadcast(room, { time, text, type });

              let log = Log.get(socket.id);
              log
                .acl()
                .tap((rec) => {
                  if (!rec) {
                    return log.write_rec({ spec, meta });
                  }
                })
                .then((rec) => {
                  return log.inc_size(chunk.length);
                })
                .tap((size) => {
                  if (size >= config.get('tailf.log.max_size')) {
                    throw new Error('file size limit');
                  }
                })
                .then(() => {
                  return log.write(payload);
                })
                // todo [akamel] catch error
                ;

            });

            c.on('end', (payload = {}, socket) => {
              let { time, type }  = payload
                , room            = socket.id
                ;

              broadcast_end(room, { time, type })
            });
          });
}

module.exports = {
    consume
};
