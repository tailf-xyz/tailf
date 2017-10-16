var express       = require('express')
  , Promise       = require('bluebird')
  , bodyParser    = require('body-parser')
  , _             = require('lodash')
  , morgan        = require('morgan')
  , config        = require('config')
  , http          = require('http')
  , humanize      = require('humanize')
  , cors          = require('cors')
  , folder_size   = require('get-folder-size')
  , Log           = require('./db/log')
  , socket        = require('./socket')
  , passport      = require('./middleware/passport')
  , id_filter     = require('./middleware/id_filter')
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

app.use(cors())
app.use(bodyParser.json());

app.use(morgan('short'));

app.put('/api/log', http_log.create);
app.get('/api/log/:id', http_log.read);
app.post('/api/log/:id/end', http_log.end);
app.get('/api/log/:id/asciicast', passport.middleware, http_log.asciicast);

app.get('/:id', id_filter, http_log.stats);
app.get('/:id/play', id_filter, passport.middleware, http_log.play);
app.get('/:id/text', id_filter, passport.middleware, http_log.text);
app.get('/:id/html', id_filter, passport.middleware, http_log.html);
app.get('/:id/stream', id_filter, passport.middleware, http_log.stream);
app.get('/:id/download', id_filter, passport.middleware, http_log.download);

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
