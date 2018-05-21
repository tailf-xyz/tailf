var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , redisscan     = require('redisscan')
  , ansi_to_html  = require('ansi-to-html')
  , humanize      = require('humanize')
  , urljoin       = require('url-join')
  , { redis }     = require('../db/redis')
  , Pub           = require('../db/pub')
  , Log           = require('../db/log')
  , Account       = require('../db/account')
  , Index         = require('../db/indexdb')
  ;

function create(req, res, next) {
  // todo [akamel] vaidate that rows, columns and keep_open and correct type (not obj)
  let { body, user = {} } = req
    , data                = body
    , { sub : owner }     = user
    ;

  Account
    .read_rec(owner)
    .then((owner) => {
      return Log.insert(data, { owner });
    })
    .then((log) => {
      let { id }      = log
        , token       = Log.gen_token(id, { owner, scope : ['read', 'write'] })
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
  let { id }  = req.params
    , { io }  = req.connection.server
    ;

  Log
    .end(id, io)
    .then(() => {
      let time = (new Date()).getTime();

      // todo [akamel] should this depend on redis success?
      Pub.emit(id, io, 'end', { time });
    })
    .then((log) => {
      res.send({ message : 'OK' });
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : 'unable to create record' });
    });
}

// todo [akamel] we allow user to change limit to pass account_max_size
function patch(req, res, next) {
  let { id }    = req.params
    , { meta }  = req.body
    ;

  Account
    .read_rec('*')
    .then((by) => {
      return Log
              .acl(id, by)
              .then((rec) => {
                _.extend(meta, rec.meta);

                let { limit_metadata } = by;

                return Log.patch_rec(id, { meta }, { limit_metadata });
              });
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
        , stream_url    = urljoin(config.get('tailf.origin'), key, 'stream') + `?token=${token}`
        , text_url      = urljoin(config.get('tailf.origin'), key, 'text') + `?token=${token}`
        , html_url      = urljoin(config.get('tailf.origin'), key, 'html') + `?token=${token}`
        , asciicast_url = urljoin(config.get('tailf.origin'), key, 'play') + `?token=${token}`
        , download_url  = urljoin(config.get('tailf.origin'), key, 'download') + `?token=${token}`
        ;

      res.render('log/stats', { key, rec, size, humanize, token, stream_url, text_url, html_url, asciicast_url, download_url });
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

const LS_TAKE = 10 * 1000;

function ls(req, res, next) {
  let { match, take = LS_TAKE } = body.body
    , keys_only                 = !match
    ;

  let ret = [];
  redisscan({
      redis
    // , pattern
    , count_amt: 10 * 1000
    , keys_only
    , each_callback : (type, key, subkey, length, value, cb) => {
        // console.log(type, key, subkey, length, value, cb)
        // ret.push({ type, key, subkey, length, value });
        if (keys_only) {
          ret.push({ key })
        } else {
          if (type === 'hash' && subkey === 'meta') {
            let object = JSON.parse(value);

            // console.log(key, object);
            if (_.isMatch(object, match)) {
              ret.push({ key, meta : value });
            }
          }
        }

        cb();
    }
    , done_callback : (err) => {
        if (err) {
          next(err);
          return;
        }

        res.send(ret);
    }
  });
}

const LS_INDEX_TAKE         = config.get('tailf.ls_limit')
    , LS_INDEX_CONCURRENCY  = 10
    ;

function ls_index(req, res, next) {
  let { user = {} }                   = req
    , { sub : owner }                 = user
    , { take = LS_INDEX_TAKE, hash }  = req.body
    ;

  Promise
    .try(() => {
      if (!owner) {
        throw new Error('owner not specified');
      }

      return Index
              .get(owner, { hash })
              // .then((result) => _.take(result, LS_INDEX_TAKE))
              // .map((id) => {
              //   let token       = Log.gen_token(id, { scope : [ 'read', 'write'] })
              //     , uri         = urljoin(config.get('tailf.origin'), id)
              //     , write_url   = `${uri}?token=${token}`
              //     , read_url    = `${uri}?token=${token}`
              //     ;
              //
              //   return Log
              //           .read_rec(id)
              //           .then((data) => {
              //             return { token, id, uri, write_url, read_url, data };
              //           });
              // }, { concurrency : LS_INDEX_CONCURRENCY })
              .then((data) => {
                let host = config.get('tailf.origin');

                res.send({ data, host });
              });
    })
    .catch((err) => {
      winston.error(err);

      res.status(500).send({ message : err.message });
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
      res.write(msg.chunk);
    }, { sans_ascii : true })
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
      res.write(msg.chunk);
    }, { type : [1], sans_ascii : true })
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
      res.write(msg.chunk);
    }, { type : [0], sans_ascii : true })
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
      chunks.push(ansi.toHtml(msg.chunk));
    }, { colorize_stderr : true, sans_ascii : true })
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
      res.write(msg.chunk);
    }, { sans_ascii : true })
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
  , ls_index
  , download
  , create
  , read
  , end
  , patch
};
