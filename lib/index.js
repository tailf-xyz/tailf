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
  , token_ex      = require('./middleware/token_exchange')
  , http_log      = require('./http/log')
  , http_account  = require('./http/account')
  , sticky        = require('sticky-session')
  // , WError      = require('verror').WError
  // , VError      = require('verror').VError
  ;

let app     = express()
  , server  = http.createServer(app)
  ;

app.set('view engine', 'pug');

app.use(express.static('public'))

app.use(cors())
app.use(bodyParser.json());

app.use(morgan('short'));

app.options('*', cors());

app.get('/docs', (req, res) => {
  res.render('docs/index');
});

app.get('/', (req, res) => {
  folder_size(Log.dirname(), (err, size) => {
    res.render('index', { size, humanize });
  });
});

app.put('/api/log'              , token_ex, passport.optional, http_log.create);
app.post('/api/log'             , token_ex, passport.required, http_log.ls_index);
app.get('/api/log/:id'          , token_ex, passport.optional, http_log.read);
app.patch('/api/log/:id'        , token_ex, passport.optional, http_log.patch);
app.get('/api/log/:id/stderr'   , token_ex, passport.optional, http_log.stderr);
app.get('/api/log/:id/stdout'   , token_ex, passport.optional, http_log.stdout);
app.post('/api/log/:id/end'     , token_ex, passport.optional, http_log.end);
app.get('/api/log/:id/asciicast', token_ex, passport.optional, http_log.asciicast);

app.get('/:id'                  , id_filter, token_ex, passport.optional, http_log.stats);
app.get('/:id/play'             , id_filter, token_ex, passport.required, http_log.play);
app.get('/:id/text'             , id_filter, token_ex, passport.required, http_log.text);
app.get('/:id/html'             , id_filter, token_ex, passport.required, http_log.html);
app.get('/:id/stream'           , id_filter, token_ex, passport.required, http_log.stream);
app.get('/:id/download'         , id_filter, token_ex, passport.required, http_log.download);


app.get('/account/', http_account.index);

function listen(options = {}) {
  return Promise
          .fromCallback((cb) => {
            if (!sticky.listen(server, options.port)) {
              // master
              server.once('listening', cb);
            } else {
              // worker
            }

            // server.listen(options.port, cb);
          })
          .then(() => {
            return socket.consume(server);
          });
}

module.exports = {
  listen
};
