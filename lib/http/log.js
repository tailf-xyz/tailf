var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , redisscan     = require('redisscan')
  , ansi_to_html  = require('ansi-to-html')
  , humanize      = require('humanize')
  , urljoin       = require('url-join')
  , { redis }     = require('../db/redis')
  , Log           = require('../db/log')
  ;

const CONTROL_CHAR = [
    '\u0000'
  , '\u0001'
  , '\u0002'
  , '\u0003'
  , '\u0004'
  , '\u0005'
  , '\u0006'
  , '\u0007'
  , '\u0008'
  , '\u000C'
  , '\u000E'
  , '\u000F'
  , '\u0010'
  , '\u0011'
  , '\u0012'
  , '\u0013'
  , '\u0014'
  , '\u0015'
  , '\u0016'
  , '\u0017'
  , '\u0018'
  , '\u0019'
  , '\u001A'
];

function create(req, res, next) {
  // todo [akamel] vaidate that rows, columns and keep_open and correct type (not obj)
  let { rows, columns, meta, keep_open, account } = req.body;

  // Account
  //   .read_rec(account)
  //   .then((rec) => {
  //   })
  Log
    .insert({ rows, columns, meta, keep_open })
    .then((log) => {
      let { id }      = log
        , token       = Log.gen_token(id, { owner : account, scope : ['read', 'write'] })
        , host        = config.get('tailf.origin')
        , uri         = urljoin(config.get('tailf.origin'), id)
        , write_url   = `${uri}?token=${token}`
        , read_url    = `${uri}?token=${token}`
        ;

      res.send({ token, id, uri, host, write_url, read_url });
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
    .then((rec) => {
      let token       = Log.gen_token(id, { scope : [ 'read', 'write'] })
        , uri         = urljoin(config.get('tailf.origin'), id)
        , host        = config.get('tailf.origin')
        , write_url   = `${uri}?token=${token}`
        , read_url    = `${uri}?token=${token}`
        ;

      res.send({ token, id, uri, host, write_url, read_url, data : rec });
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

function patch(req, res, next) {
  let { id }    = req.params
    , { meta }  = req.body;
    ;

  Log
    .acl(id)
    .then((rec) => {
      _.extend(meta, rec.meta)
      
      return Log.patch_rec(id, { meta });
    })
    .then(() => {
      res.status(202).end();
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : 'unable to patch record' });
    });
}

function stats(req, res, next) {
  let { id } = req.params;

  Log
    .acl(id)
    .then((rec) => {
      let { key, size } = rec
        , token         = Log.gen_token(id, { scope : ['read'] })
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
    , token   = Log.gen_token(id, { scope : ['read'] })
    ;

  res.render('log/play', { url : `/api/log/${id}/asciicast?token=${token}` });
}

function ls(req, res, next) {
  let { match } = req.body;

  let arr = [];
  redisscan({
      redis
      // pattern: 'hash:key:prefix:*',
    , count_amt: 1000
    , keys_only: true
    , each_callback : (type, key, subkey, length, value, cb) => {
        // let obj = JSON.parse(value);
        // console.log(type, key, subkey, length, value, cb)
        arr.push({ type, key, subkey, length, value });

        if (type === 'hash') {
          if (subkey === 'key') {
            // arr.push({ key });
            arr.push({ type, key, subkey, length, value });
          }
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
    .acl(id)
    .then((rec = {}) => {
      let { rows, columns } = rec;

      return Log.write_asciicast(id, res, { rows, columns });
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : err.message });
    });
}

function text(req, res, next) {
  let { id } = req.params;

  res.setHeader('content-type', 'text/plain; charset=utf-8');
  Log
    .chunks(id, (msg) => {
      let text        = msg.chunk.toString('utf-8')
        , sans_ascii  = _.without([...text], ...CONTROL_CHAR);
        ;

      res.write(sans_ascii.join(''));
    })
    .then(() => {
      res.end();
    })
    .catch((err) => {
      res.status(500).send({ message : err.message });
    });
}

function stderr(req, res, next) {
  let { id } = req.params;

  res.setHeader('content-type', 'text/plain; charset=utf-8');
  Log
    .chunks(id, (msg) => {
      let text = msg.chunk.toString('utf-8');
      res.write(text);
    }, { type : [1] })
    .then(() => {
      res.end();
    })
    .catch((err) => {
      res.status(500).send({ message : err.message });
    });
}

function stdout(req, res, next) {
  let { id } = req.params;

  res.setHeader('content-type', 'text/plain; charset=utf-8');
  Log
    .chunks(id, (msg) => {
      let text = msg.chunk.toString('utf-8');
      res.write(text);
    }, { type : [0] })
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

  let ansi = new ansi_to_html({ stream : true, fg: '#FFF', bg: '#000' });
  Log
    .chunks(id, (msg) => {
      let text = msg.chunk.toString('utf-8');
      chunks.push(ansi.toHtml(text));
    }, { colorize_stderr : true })
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
  , stderr
  , stdout
  , html
  , stream
  , stats
  , ls
  , download
  , create
  , read
  , end
  , patch
};
