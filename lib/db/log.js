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
  , lru_cache     = require('lru-cache')
  // , msgpack       = require('msgpack-lite')
  , jwt           = require('jsonwebtoken')
  , msgpack       = require('snappy-msgpack-stream')
  ;

const cert = config.get('jwt.key');

// seperate file_stream cache from record
let cache = lru_cache({
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

              return rec;
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
      , stream    = output(filename, { flags : 'a+' })
      , encoder   = msgpack.createEncodeStream()
      ;

    encoder.pipe(stream);

    obj.output = encoder;
    cache.set(key, obj);

    return encoder;
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

    let msg = { time, chunk : chunk.toString('utf-8'), type };

    stream.write(msg);

    Log.inc_size(key, chunk.length);

    return msg;
  }

  static chunks(key, on_chunk, on_end, options = {}) {
    return Log
            .reader(key)
            .then((stream) => {
              let { colorize_stderr } = options;

              return Promise
                      .fromCallback((cb) => {
                        stream
                          // .on('data', on_chunk)
                          .on('data', (obj) => {
                            try {
                              switch(obj.type) {
                                case 0:
                                // obj.type = 'stdout';
                                break;
                                case 1:
                                // obj.type = 'stderr';
                                if (colorize_stderr) {
                                  obj.chunk = `\x1b[31m${obj.chunk}\x1b[m`;
                                }
                                break;
                              }

                              on_chunk(obj);
                            } catch (err) {
                              cb(err);
                            }
                          })
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
            }, { colorize_stderr : true });
  }

  // static read_size(key) {
  //   let obj = cache.get(key);
  //   if (_.has(obj, 'size')) {
  //     console.log('size from cache', obj.size)
  //     return Promise.resolve(obj.size);
  //   }
  //
  //   return redis.hgetAsync(`${key}`, 'size').then(Number.parseInt);
  // }

  static inc_size(key, inc) {
    return redis
            .hincrbyAsync(`${key}`, 'size', inc)
            .tap((size) => {
              if (!cache.has(key)) {
                cache.set(key, {});
              }

              cache.get(key).size = size;
            });
  }

  static stats(key) {
    return Log.read_rec(key);
  }

  static write_rec(key, options = {}) {
    return Promise
            .try(() => {
              let date                                = new Date().getTime()
                , { rows, columns, meta, keep_open }  = options
                , rec                                 = { key, date, rows, columns, keep_open }
                ;

              if (_.isObject(meta)) {
                let str = JSON.stringify(meta);

                if (_.size(str) > 100 * 1024) {
                  throw new Error('size limit');
                }

                rec.meta = str;
              }

              Log.patch_rec(key, rec);
            });
  }

  static patch_rec(key, patch = {}) {
    // remove undefined values
    patch = _.omitBy(patch, _.isUndefined);

    return redis.hmsetAsync(key, patch);
  }

  static read_rec(key) {
    return redis
            .hgetallAsync(key)
            .tap((result) => {
              if (result) {
                result.rows = Number.parseInt(result.rows);
                result.columns = Number.parseInt(result.columns);
                result.size = Number.parseInt(result.size);
                result.end = Boolean(result.end);
                result.keep_open = Boolean(result.keep_open);
                result.meta = result.meta && JSON.parse(result.meta);
                result.date = new Date(Number.parseInt(result.date));

                result.code = Number.parseInt(result.code);

                if (!_.isInteger(result.code)) {
                  delete result.code;
                }

                if (!_.isInteger(result.rows)) {
                  delete result.rows;
                }

                if (!_.isInteger(result.columns)) {
                  delete result.columns;
                }
              }
            });
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

  static end(key) {
    return Log.patch_rec(key, { end : true });
  }

  static chunk_to_html(msg) {
    let text = msg.chunk.toString('utf-8');
    return new ansi_to_html().toHtml(text);
  }

  static dirname() {
    return disk;
  }

  static gen_token(sub, scope = []) {
    return jwt.sign({ sub, sub_type : 'log', scope }, cert, { algorithm : 'RS256', expiresIn : '6h', issuer : 'tailf.io' })
  }
}

module.exports = Log;
