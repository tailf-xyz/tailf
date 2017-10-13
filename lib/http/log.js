var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , redisscan     = require('redisscan')
  , ansi_to_html  = require('ansi-to-html')
  , humanize      = require('humanize')
  , { redis }     = require('../db/redis')
  , Log           = require('../db/log')
  ;

function create(req, res, next) {
  // todo [akamel] vaidate that rows, columns and keep_open and correct type (not obj)
  let { rows, columns, meta, keep_open } = req.body;

  Log
    .insert({ rows, columns, meta, keep_open })
    .then((log) => {
      let { id }    = log
        , token     = Log.gen_token(id, ['write'])
        , write_url = config.get('tailf.write_url')
        ;

      res.send({ write_url, token, id });
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : 'unable to create record' });
    });
}

function read(req, res, next) {
  let { id } = req.params;

  Log
    .acl(id)
    .then(() => {
      let token     = Log.gen_token(id, ['write'])
        , write_url = config.get('tailf.write_url')
        ;

      res.send({ write_url, token, id });
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : err.message });
    });
}

function end(req, res, next) {
  let { id } = req.params;

  Log
    .end(id)
    .then((log) => {
      res.send({ message : 'OK' });
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : 'unable to create record' });
    });
}


function stats(req, res, next) {
  let { id } = req.params;

  Log
    .acl(id)
    .then((rec) => {
      let { key, size } = rec
        , token         = Log.gen_token(id, ['read'])
        ;

      res.render('log/stats', { key, rec, size, humanize, token });
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : err.message });
    });
}

function play(req, res, next) {
  let { id }  = req.params
    , token   = Log.gen_token(id, ['read'])
    ;

  res.render('log/play', { url : `/api/log/${id}/asciicast?token=${token}` });
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

  Log
    .read_rec(id)
    .then((rec = {}) => {
      let { rows, columns } = rec;

      Log
        .write_asciicast(id, res, { rows, columns })
        .catch((err) => {
          // todo [akamel] consolidate err handling
          res.status(500).send({ message : err.message });
        });
    })
}

function text(req, res, next) {
  let { id } = req.params;

  res.setHeader('content-type', 'text/plain; charset=utf-8');
  Log
    .chunks(id, (msg) => {
      // res.write(`${chunk.text}`);
      let text = msg.chunk.toString('utf-8');
      res.write(text);
    })
    .then(() => {
      res.end();
    })
    .catch((err) => {
      res.status(500).send({ message : err.message });
    });
}

function html(req, res, next) {
  let { id } = req.params;

  res.setHeader('content-type', 'text/html');
  let chunks = [];

  let ansi = new ansi_to_html({ stream : true });
  Log
    .chunks(id, (msg) => {
      let text = msg.chunk.toString('utf-8');
      chunks.push(ansi.toHtml(text));
    }, () => {}, { colorize_stderr : true })
    .then(() => {
      res.render('log/html', { chunks });
    })
    .catch((err) => {
      res.status(500).send({ message : err.message });
    });
}

function stream(req, res, next) {
  let { id }    = req.params
    , { token } = req.query
    ;

  res.render('log/stream', { id, token });
}

function download(req, res, next) {
  let { id } = req.params;

  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${id}"`);
  Log
    .chunks(id, (msg) => {
      let text = msg.chunk.toString('utf-8');
      res.write(text);
    })
    .then(() => {
      res.end();
    })
    .catch((err) => {
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
  , download
  , create
  , read
  , end
};
