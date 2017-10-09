'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , byline        = require('byline')
  , output        = require('create-output-stream')
  , fs            = require('fs')
  , path          = require('path')
  , randtoken     = require('rand-token')
  , asciicast     = require('./asciicast')
  , { redis }     = require('./redis')
  , ansi_to_html  = require('ansi-to-html')
  , lru_cache     = require('lru-cache')
  , msgpack       = require('msgpack-lite')
  ;

var cache = lru_cache({
                max     : 10 * 1000
              , maxAge  : 30 * 60 * 1000
              , dispose : (key, obj = {}) => {
                  let { output } = obj;

                  if (output) {
                    output.end();
                  }
              }
            });

let disk = config.get('tailf.log.dirname');

class Log {
  static acl(key) {
    return Log
            .read_rec(key)
            .then((rec) => {
              if (!rec) {
                throw new Error('not found');
              }
            })
  }

  static filename(key) {
    return `${disk}/${key}`;
  }

  static reader(key) {
    let filename = Log.filename(key);

    return Promise
            .fromCallback((cb) => {
              // let ret = fs.createReadStream(filename, 'utf-8');
              let ret = fs.createReadStream(filename);

              let decoder = msgpack.createDecodeStream();

              ret.pipe(decoder);

              ret.on('error', (err) => cb(new Error('file not found')));
              ret.on('open', () => cb(undefined, decoder));
            });
  }


  static writer(key) {
    let obj = cache.get(key) || {};

    if (obj.output) {
      return obj.output;
    }

    let filename  = Log.filename(key)
      , stream    = output(filename, { flags : 'a' })
      ;

    obj.output = msgpack.createEncodeStream();
    obj.output.pipe(stream);

    cache.set(key, obj);

    return obj.output;
  }

  static write(key, payload) {
    let { time, chunk = [], type }  = payload
      ,  stream                     = Log.writer(key)
      ;

    switch(type) {
      case 'stdout':
      type = 0;
      break;
      case 'stderr':
      type = 1;
      break;
    }

    stream.write({ time, chunk, type });

    Log.inc_size(key, chunk.length);
  }

  static chunks(key, on_chunk, on_end) {
    return Log
            .reader(key)
            .then((stream) => {
              return Promise
                      .fromCallback((cb) => {
                        stream
                          .on('data', on_chunk)
                          // .on('data', (obj) => {
                          //   switch(obj.type) {
                          //     case 0:
                          //     obj.type = 'stdout';
                          //     break;
                          //     case 1:
                          //     obj.type = 'stderr';
                          //     break;
                          //   }
                          //
                          //   on_chunk(obj);
                          // })
                          .on('end', () => cb())
                          .on('error', (err) => cb(new Error('file not found')));
                      });
            })
            .asCallback(on_end);
  }

  static write_asciicast(key, res, options = {}) {
    let first     = undefined
      , last      = undefined
      ;

    return Log
            .chunks(key, (msg) => {
              let text = msg.chunk.toString('utf-8');
              let frame           = [ 0, text ]
                , is_first_line   = !first
                ;

              if (is_first_line) {
                first = msg;
                res.write(asciicast.open(options));
                res.write(`  `);
              } else {
                res.write(`, `);
                frame[0] = (msg.time - last.time) / 1000;
              }

              last = msg;
              res.write(`${JSON.stringify(frame)}\n`);
            }, (err) => {
              if (!err) {
                let duration = (last.time - first.time) / 1000;

                res.write(asciicast.close(duration));
                res.end();
                return;
              }

              res.status(500).send({ message : err.message });
            });
  }

  static read_size(key) {
    let obj = cache.get(key);
    if (_.has(obj, 'size')) {
      console.log('size from cache', obj.size)
      return Promise.resolve(obj.size);
    }

    return redis.getAsync(`size:${key}`).then(Number.parseInt);
  }

  static inc_size(key, inc) {
    return redis
            .incrbyAsync(`size:${key}`, inc)
            .tap((size) => {
              if (cache.has(key)) {
                cache.get(key).size = size;
                return size;
              }

              cache.set(key, { size });
              return size;
            });
  }

  static stats(key) {
    return Promise
            .all([ Log.read_rec(key), Log.read_size(key) ])
            .spread((rec, size) => {
              // if (!rec) {
              //   throw new Error('not found')
              // }

              // let { key } = rec;
              return {
                  key
                , rec
                , size
              };
            })
  }

  static write_rec(key, options = {}) {
    return Promise
            .try(() => {
              let date                    = new Date().getTime()
                , { rows, columns, meta } = options
                , rec                     = { key, date, rows, columns, meta }
                , str                     = JSON.stringify(rec)
                ;

              if (str.length > 100 * 1024) {
                throw new Error('size limit');
              }

              return redis
                      .setnxAsync(key, str)
                      .tap((res) => {
                        if (res == 0) {
                          throw new Error('key collision');
                        }
                      });
            });
  }

  static read_rec(key) {
    return redis
            .getAsync(key)
            .then(JSON.parse)
            ;
  }

  static insert(options = {}) {
    return Promise
            .try(() => {
              let key = randtoken.generate(32);

              return Log
                      .write_rec(key, options)
                      .then((res) => {
                        // let ret = new Log(key, rec);
                        // todo [akamel] cleanup cache
                        // cache.set(key, ret);
                        // return ret;
                        return { id : key };
                      });
            });
  }

  static chunk_to_html(msg) {
    let text = msg.chunk.toString('utf-8');
    return new ansi_to_html().toHtml(text);
  }

  static dirname() {
    return disk;
  }
}

module.exports = Log;
