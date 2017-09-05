var express       = require('express')
  , Promise       = require('bluebird')
  , bodyParser    = require('body-parser')
  , _             = require('lodash')
  , morgan        = require('morgan')
  , config        = require('config')
  , http          = require('http')
  , Log           = require('./mongoose/Log')
  , socket        = require('./socket')
  , http_log      = require('./http/log')
  // , rp          = require('request-promise')
  // , WError      = require('verror').WError
  // , VError      = require('verror').VError
  ;

let { user, password, hostname, port, database } = config.get('tailf.mongo');

let app     = express()
  , server  = http.createServer(app)
  ;

app.use(bodyParser.json());

app.use(morgan('short'));

app.get('/log/:id/play', http_log.play);

app.get('/log/:id/json', http_log.json);

function listen(options = {}) {
  return Promise
          .fromCallback((cb) => {
            server.listen(options.port, cb);
          })
          .then(() => {
            return socket.consume(server);
          });
}

module.exports = {
  listen
};
