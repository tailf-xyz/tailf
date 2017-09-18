var express       = require('express')
  , Promise       = require('bluebird')
  , bodyParser    = require('body-parser')
  , _             = require('lodash')
  , morgan        = require('morgan')
  , config        = require('config')
  , http          = require('http')
  , humanize      = require('humanize')
  , folder_size   = require('get-folder-size')
  , Log           = require('./db/log')
  , socket        = require('./socket')
  , http_log      = require('./http/log')
  , http_account  = require('./http/account')
  // , WError      = require('verror').WError
  // , VError      = require('verror').VError
  ;

// let { user, password, hostname, port, database } = config.get('tailf.mongo');

let app     = express()
  , server  = http.createServer(app)
  ;

app.set('view engine', 'pug');

app.use(express.static('public'))

app.use(bodyParser.json());

app.use(morgan('short'));

app.get('/log/:id', http_log.stats);
app.get('/log/:id/play', http_log.play);
app.get('/log/:id/text', http_log.text);
app.get('/log/:id/html', http_log.html);
app.get('/log/:id/stream', http_log.stream);
app.get('/log/:id/asciicast', http_log.asciicast);

// app.all('/log/ls', http_log.ls);

app.get('/account/', http_account.index);
app.get('/account/subscribe/', http_account.subscribe);
app.post('/account/subscribe/', http_account.create_subscription);

const limit_per_file = config.get('tailf.log.limit_per_file');

app.get('/', (req, res) => {
  folder_size(Log.dirname(), (err, size) => {
    res.render('index', { size, humanize, limit_per_file });
  });
});

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
