var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , { redis }     = require('../db/redis')
  , redisscan     = require('redisscan')
  , Log           = require('../db/log')
  // , asciicast     = require('../asciicast')
  ;

function play(req, res, next) {
  let { id } = req.params;

  res.render('log/play', { url : `/log/${id}/asciicast` });
}

function ls(req, res, next) {
  let { match } = req.body;

  let arr = [];
  redisscan({
      redis
    // pattern: 'awesome:key:prefix:*',
    , keys_only: false
    , each_callback : (type, key, subkey, length, value, cb) => {
        let obj = JSON.parse(value);

        // todo [akamel] not efficient
        if (!_.isObject(match)) {
          arr.push(obj);
        } else if (_.isMatch(obj, match)) {
          arr.push(obj);
        }

        cb();
    }
    , done_callback : (err) => {
        if (err) {
          next(err);
          return;
        }

        res.send(arr);
    }
  });
}

function asciicast(req, res, next) {
  let { id } = req.params;

  let log = Log.get(id);
  log
    .read_rec()
    .then((rec) => {
      log.write_asciicast(res, rec);
    })
    .catch((err) => {
      res.status(500).send({ message : 'not found' });
    });
}

function text(req, res, next) {
  let { id } = req.params;

  Log.get(id)
        .chunks((chunk) => {
          res.write(`${chunk.text}`);
        }, (err) => {
          if (!err) {
            res.end();
            return;
          }

          res.status(500).send({ message : err.message });
        });
}

function html(req, res, next) {
  let { id } = req.params;

  let chunks = [];
  Log.get(id)
        .chunks((chunk) => {
          chunks.push(Log.chunk_to_html(chunk));
        }, (err) => {
          if (!err) {
            res.render('log/html', { chunks });
            return;
          }

          res.status(500).send({ message : err.message });
        });
}

function stream(req, res, next) {
  let { id } = req.params;

  res.render('log/stream', { id });
}

function stats(req, res, next) {
  let { id } = req.params;

  Log.get(id)
      .stats()
      .then((stats) => {
        res.render('log/stats', stats);
      })
      .catch((err) => {
        winston.error(err);

        res.status(500).send({ message : err.message });
      });
}

module.exports = {
    play
  , asciicast
  , text
  , html
  , stream
  , stats
  , ls
};
