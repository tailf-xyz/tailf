var express       = require('express')
  , Promise       = require('bluebird')
  , bodyParser    = require('body-parser')
  , winston       = require('winston')
  , config        = require('config-url')
  , _             = require('lodash')
  , morgan        = require('morgan')
  , http          = require('http')
  , { Consumer }  = require('taskmill-core-tailf')
  // , rp          = require('request-promise')
  // , WError      = require('verror').WError
  // , VError      = require('verror').VError
  ;

let app     = express()
  , server  = http.createServer(app)
  ;

app.use(bodyParser.json());

app.use(morgan('short'));

function listen(options = {}) {
  return Promise
          .fromCallback((cb) => {
            server.listen(options.port, cb);
          })
          .then(() => {
            return (new Consumer())
                    .listen({ server })
                    .then((c) => {
                      function get_socket(payload) {
                        let { room } = payload;

                        return c.io.sockets.connected[room];
                      }

                      // todo [akamel] there are 2 streams here... we are treating them as one
                      c.on('chunk', (payload) => {
                        let ws = get_socket(payload);

                        if (ws) {
                          let { meta : { type }, chunk } = payload
                            , text = chunk? chunk.toString('utf-8') : null
                            ;

                          ws.emit('chunk', { type, text });
                          ws.emit('stdio', { type, text });
                        }
                      });

                      c.on('end', (payload) => {
                        let ws = get_socket(payload);

                        if (ws) {
                          let { meta : { type } } = payload;

                          ws.emit('end', { type });
                          ws.emit('stdio', { type });
                        }
                      });
                    });
          });
}

module.exports = {
  listen
};
