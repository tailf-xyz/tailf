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

app.set('view engine', 'pug');

app.use(express.static('node_modules/breadboard-sdk-web/dist'))

app.use(bodyParser.json());

app.use(morgan('short'));

app.get('/log/:id/play', http_log.play);
app.get('/log/:id/text', http_log.text);
app.get('/log/:id/html', http_log.html);
app.get('/log/:id/asciicast', http_log.asciicast);

app.all('/log/ls', http_log.ls);

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
