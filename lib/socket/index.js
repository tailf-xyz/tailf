var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config-url')
  , winston       = require('winston')
  , io_redis      = require('socket.io-redis')
  , socket_io     = require('socket.io')
  , socket_io_jwt = require('socketio-jwt')
  , Log           = require('../db/log')
  , Pub           = require('../db/pub')
  , Sub           = require('../db/sub')
  // , Account       = require('../db/account')
  , { redis }     = require('../db/redis')
  // , Time          = require('time-diff')
  ;

const pub = config.get('jwt.public');

function consume(server) {
  let io = socket_io(server, { httpCompression : true });

  let { host, port }  = config.getUrlObject('tailf.redis')
    , db              = config.get('tailf.redis.db')
    , password        = config.get('tailf.redis.password')
    , requestsTimeout = 200 /*ms*/
    ;

  io.adapter(io_redis({ host, port, db, password, requestsTimeout }));
  // let red = io_redis({ host, port, db, password, requestsTimeout });
  // io.adapter(red);
  //
  // red.pubClient.debug_mode = true;
  // red.subClient.debug_mode = true;
  io.of('/').adapter.on('error', (err) => {
    console.error('socket.io-redis', err);
  });

  io
    .on('connection', socket_io_jwt.authorize({
        secret    : (request, token, cb) => { cb(null, pub); }
      , timeout   : 5 * 1000 // 15 seconds to send the authentication message
      // , required  : false
      // , callback: false
    }))
    .on('authenticated', (socket) => {
      let { sub, sub_type, scope } = socket.decoded_token;

      winston.info('authenticated', sub, scope, socket.id);

      if (_.includes(scope, 'write')) {
        Pub
          .get(socket)
          .then(() => socket.emit('writable'));
        return;
      }

      if (_.includes(scope, 'read')) {
        Sub
          .get(socket)
          .then(() => socket.emit('readable'));
        return;
      }

      socket.disconnect(true);
      // socket.emit('error', { message : 'invalide scope' });
      // setTimeout(() => { socket.disconnect(true); }, 500);
    })
}

module.exports = {
    consume
};



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
