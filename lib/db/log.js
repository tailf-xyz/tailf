'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , output        = require('create-output-stream')
  , fs            = require('fs')
  , path          = require('path')
  , randtoken     = require('rand-token')
  , asciicast     = require('./asciicast')
  , { redis }     = require('./redis')
  , Index         = require('./indexdb')
  , lru_cache     = require('lru-cache')
  // , msgpack       = require('msgpack-lite')
  , jwt           = require('jsonwebtoken')
  , msgpack       = require('snappy-msgpack-stream')
  , rfs           = require('rotating-file-stream')
  , klaw          = require('klaw')
  , async         = require('async')
  ;

const CERT        = config.get('jwt.key')
  ,   chunk_size  = config.get('tailf.chunk.size')
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
  // todo [akamel] read owner's info
  static acl(key, by) {
    return Log
            .read_rec(key)
            .then((rec) => {
              if (!rec) {
                throw new Error('not found');
              }

              return rec;
            })
  }

  static pathname(key) {
    return `${disk}/${key}`;
  }

  static filenamer(key, time, index) {
    // console.log(key, time, index);

    // let ret = `${key}`;
    let ret = 'chunk';

    if (time) {
      ret += `-${time.getTime()}`;
    }

    if (index) {
      ret += `-${index}`;
    }

    return ret;
  }

  static klaw_filenames(key) {
    return Promise
            .fromCallback((cb) => {
              let pathname    = Log.pathname(key)
                , ret         = []
                , depthLimit  = 0
                , pathSorter  = (a, b) => a.localeCompare(b)
                , filter      = (fullname) => !path.extname(fullname)
                ;

              klaw(pathname, { depthLimit, pathSorter, filter })
                .on('data', (item) => {
                  if (item.stats.isFile()) {
                    ret.push(item);
                  }
                })
                .on('error', cb)
                .on('end', () => cb(undefined, ret));
            })
            .tap((filenames) => {
              if (!_.size(filenames)) {
                throw new Error('file not found');
              }
            });
  }

  static filenames(key) {
    return Promise
            .fromCallback((cb) => {
              fs.readFile(`${Log.pathname(key)}/chunk.txt`, 'utf-8', cb)
            })
            .then((text) => text.split('\n'))
            .map((pathname) => {
              return { path : pathname };
            })
            .catch((err) => {
              // if error reading chunk.tex
              return Log.klaw_filenames(key);
            })
  }

  // todo [akamel] do we still need this on open event?
  // ret.on('open', () => cb(undefined, decoder));
  static reader(key, options = {}) {
    let { limit } = options;

    return Log
            .filenames(key)
            .then((filenames) => {
              let ret = filenames;

              if (limit) {
                ret = _.takeRight(ret, limit);
              }

              return ret;
            })
            .then((filenames) => {
              let decoder = msgpack.createDecodeStream();

              async
                .eachSeries(filenames, ({ path : fullname }, cb) => {
                  fs.createReadStream(fullname)
                    .on('error', (err) => {
                      cb(new Error(`error reading file ${fullname}`));
                    })
                    .on('end', cb)
                    .pipe(decoder, { end : false })
                    .on('error', (err) => {
                      cb(new Error(`error decoding file ${fullname}`));
                    });
                }, (err) => {
                  if(err) {
                    winston.error(err);
                    decoder.destroy(err);
                    return;
                  }

                  decoder.end();
                });

              return decoder;
            });
  }

  static writer(key, options = {}) {
    let obj = cache.get(key) || {};

    if (obj.output) {
      return obj.output;
    }

    // todo [akamel] we need to stop writing once we reach the limit (if not rotate) otherwise we can lose data
    let filenamer = (t, i) => Log.filenamer(key, t, i)
      , { limit } = options
      , stream    = rfs(filenamer, { size : `${chunk_size}B`, maxSize: `${limit}B`, path : Log.pathname(key) })
      , encoder   = msgpack.createEncodeStream()
      ;

      stream.on('error', function(err) {
        console.error('stream:error', err);
      });

      stream.on('open', function(filename) {
        console.log('stream:open', filename)
      });

      stream.on('removed', function(filename, number) {
        console.log('stream:removed', filename, number)
      });

      stream.on('rotation', function() {
        console.log('stream:rotation')
      });

      stream.on('rotated', function(filename) {
        console.log('stream:rotated', filename)
      });

      stream.on('warning', function(err) {
          // here are reported non blocking errors
      });

    encoder.pipe(stream);

    obj.output = encoder;
    cache.set(key, obj);

    return encoder;
  }

  static write(key, payload, options) {
    let { time, chunk = [], type }  = payload
      ,  stream                     = Log.writer(key, options)
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

  static chunks(key, on_chunk, options = {}) {
    return Log
            .reader(key)
            .then((stream) => {
              let { colorize_stderr, type : filter_type, sans_ascii = false } = options;

              return Promise
                      .fromCallback((cb) => {
                        stream
                          // .on('data', on_chunk)
                          .on('data', (obj) => {
                            if (_.isArray(filter_type)) {
                              let type      = obj.type || 0
                                , included  = _.includes(filter_type, type)
                                ;

                              if (!included) {
                                return;
                              }
                            }

                            switch(obj.type) {
                              case 1:
                              // obj.type = 'stderr';
                              if (colorize_stderr) {
                                obj.chunk = `\x1b[31m${obj.chunk}\x1b[m`;
                              }
                              break;
                            }

                            if (sans_ascii) {
                              obj.chunk  = _.without([...obj.chunk], ...CONTROL_CHAR).join('');
                            }

                            try {
                              on_chunk(obj);
                            } catch (err) {
                              cb(err);
                            }
                          })
                          .on('end', () => cb())
                          .on('error', (err) => {
                            cb(new Error('file not found'))
                          });
                      });
            });
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
            }, { colorize_stderr : true })
            .then(() => {
              let duration = (last.time - first.time) / 1000;

              res.write(asciicast.close(duration));
              res.end();
            })
            .catch((err) => {
              res.status(500).send({ message : err.message });
            });
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
              let date  = new Date().getTime()
                , rec   = { key, date, ...options }
                ;

              let { limit_metadata, ttl } = options;

              return Log.patch_rec(key, rec, { limit_metadata, ttl });
            });
  }

  static patch_rec(key, patch = {}, options = {}) {
    return Promise
            .try(() => {
              // remove undefined values
              return _.omitBy(patch, _.isUndefined);
            })
            .then((patch) => {
              let { meta } = patch;

              if (_.isObject(meta)) {
                let str = JSON.stringify(meta)
                  , len = Buffer.byteLength(str, 'utf8')
                  ;

                // let { limit_metadata } = config.get('tailf.metering.*');
                let { limit_metadata, ttl } = options;

                if (len > limit_metadata) {
                  throw new Error('size limit');
                }

                patch.ttl = ttl;

                patch.meta = str;
              }

              return patch;
            })
            .then((patch) => {
              return redis
                      .hmsetAsync(key, patch)
                      .tap(() => {
                        let { ttl } = patch;

                        if (ttl) {
                          return redis.pexpire(key, ttl);
                        }
                      });
            })
  }

  static read_rec(key) {
    return redis
            .hgetallAsync(key)
            .tap((result) => {
              if (result) {
                // https://www.npmjs.com/package/morpheusjs
                // https://github.com/loedeman/AutoMapper/wiki/Getting-started
                result.rows = Number.parseInt(result.rows);
                result.columns = Number.parseInt(result.columns);
                result.size = Number.parseInt(result.size);
                result.end = Boolean(result.end);
                result.meta = result.meta && JSON.parse(result.meta);
                result.date = new Date(Number.parseInt(result.date));
                result.ttl = Number.parseInt(result.ttl);

                result.code = Number.parseInt(result.code);

                if (!_.isEmpty(result.keep_open)) {
                  result.keep_open = Boolean(result.keep_open);
                } else {
                  delete result.keep_open;
                }

                if (!_.isEmpty(result.rotate)) {
                  result.rotate = Boolean(result.rotate);
                } else {
                  delete result.rotate;
                }

                if (!_.isEmpty(result.limit)) {
                  result.limit = Number.parseInt(result.limit);
                } else {
                  delete result.limit;
                }

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

  static insert(data = {}, options = {}) {
    let { owner } = options;

    let key = randtoken.generate(32);

    let { limit_metadata } = owner;

    // this ensure that we don't get the end property at creation time.
    data = _.omit(data, ['end']);

    let a = Log.write_rec(key, data, { limit_metadata })
      , b = Index.add(key, data)
      ;

    return Promise
            .all([a, b])
            .then(() => {
              return { id : key };
            });
  }

  static end(key, io) {
    return Log.patch_rec(key, { end : true });
  }

  static chunk_to_html(msg) {
    let text = msg.chunk.toString('utf-8');
    return new ansi_to_html().toHtml(text);
  }

  static dirname() {
    return disk;
  }

  static gen_token(sub, options = {}) {
    let { owner = '*', scope = [] } = options;
    return jwt.sign({ sub, sub_type : 'log', owner, scope }, CERT, { algorithm : 'RS256', expiresIn : '6h', issuer : 'tailf.io' })
  }
}

module.exports = Log;
