var express       = require('express')
  , Promise       = require('bluebird')
  , bodyParser    = require('body-parser')
  , _             = require('lodash')
  , morgan        = require('morgan')
  , config        = require('config')
  , http          = require('http')
  // , mongoose      = require('mongoose')
  , Log           = require('./mongoose/Log')
  , socket        = require('./socket')
  , http_log      = require('./http/log')
  // , rp          = require('request-promise')
  // , WError      = require('verror').WError
  // , VError      = require('verror').VError
  ;

let { user, password, hostname, port, database } = config.get('tailf.mongo');

// mongoose.connect(`mongodb://${user}:${password}@${hostname}:${port}/${database}`);

let app     = express()
  , server  = http.createServer(app)
  ;

app.use(bodyParser.json());

app.use(morgan('short'));

// app.put('/log', (req, res, next) => {
//   let metadata = _.get(req.body, 'metadata');
//
//   new Log({ metadata })
//         .save()
//         .then((result) => {
//           res.send(result);
//         })
//         .catch((err) => {
//           res.status(500).send(err);
//         })
// });

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
