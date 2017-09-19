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
  ;

var not_found = lru_cache({ max : 100 * 1000, maxAge : 1 * 60 * 1000 });

var cache = lru_cache({ max : 100 * 1000, maxAge : 20 * 60 * 1000 });

var writers = lru_cache({ max : 10 * 1000, maxAge : 10 * 60 * 1000, dispose : (key, p) => p.then(s => s.end()) });
var readers = lru_cache({ max : 1000, maxAge : 1 * 60 * 1000, dispose : (key, p) => p.then(s => s.close()) });

let disk = config.get('tailf.log.dirname');

class Log {
  constructor(id, rec) {
    this.id = id;
    this.rec = rec;
  }

  key() {
    return this.id;
  }

  filename() {
    let key = this.key();

    return `${disk}/${key}`;
  }

  writer() {
    let key = this.key();

    if (!writers.has(key)) {
      let filename  = this.filename()
        , norm      = path.normalize(filename)
        ;

      if (_.startsWith(norm, '..')) {
        throw new Error('not found');
      }

      let ret = Promise.resolve(output(filename, { flags : 'a' }));
      writers.set(key, ret);
    }

    return writers.get(key);
  }

  reader() {
    let key = this.key();

    if (!readers.has(key)) {
      let filename  = this.filename()
        , norm      = path.normalize(filename)
        ;

      let ret = Promise
                .fromCallback((cb) => {
                  if (_.startsWith(norm, '..')) {
                    return cb(new Error('not found'));
                  }

                  let ret = fs.createReadStream(filename, 'utf-8');

                  ret.on('error', (err) => cb(new Error('file not found')));
                  ret.on('open', () => cb(undefined, ret));
                });

      // readers.set(key, ret);
      return ret;
    }

    return readers.get(key);
  }

  read_size() {
    let key = `size:${this.key()}`;
    return redis.getAsync(key).then(Number.parseInt);
  }

  inc_size(inc) {
    let key = `size:${this.key()}`;
    return redis.incrbyAsync(key, inc);
  }

  stats() {
    return Promise
            .all([ this.rec, this.read_size() ])
            .spread((rec, size) => {
              // if (!rec) {
              //   throw new Error('not found')
              // }

              // let { key } = rec;
              let key = this.id;
              return {
                  key
                , rec
                , size
              };
            })
  }

  write(payload) {
    this
      .writer()
      .then((stream) => {
        let { time, chunk, type } = payload;

        stream.write(time.toString());
        stream.write(' ');
        stream.write(new Buffer(chunk).toString('base64'));
        stream.write('\n');
      })
  }

  chunks(on_chunk, on_end) {
    return this
            .reader()
            .then((stream) => {
              return Promise
                      .fromCallback((cb) => {
                        byline(stream)
                          .setEncoding('utf-8')
                          .on('data', (line) => {
                            try {
                              let time = line.substring(0, 13)
                                , text = new Buffer(line.substring(14), 'base64').toString('utf-8')
                                ;

                              on_chunk({ time, text });
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

  write_asciicast(res) {
    let { spec }  = this.rec
      , first     = undefined
      , last      = undefined
      ;

    this
      .chunks((chunk) => {
        let frame           = [ 0, chunk.text ]
          , is_first_line   = !first
          ;

        if (is_first_line) {
          first = chunk;
          res.write(asciicast.open(spec));
          res.write(`  `);
        } else {
          res.write(`, `);
          frame[0] = (chunk.time - last.time) / 1000;
        }

        last = chunk;
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

  static get(key) {
    return Promise
            .try(() => {
              if (cache.has(key)) {
                return cache.get(key);
              }

              let ret = new Log(key);
              cache.set(key, ret);
              return ret;
              // if (not_found.has(key)) {
              //   throw new Error('rec not found');
              // }

              // return redis
              //         .getAsync(key)
              //         .then((str) => {
              //           if (!str) {
              //             not_found.set(key);
              //             throw new Error('rec not found');
              //           }
              //
              //           return JSON.parse(str);
              //         })
              //         .then((rec) => {
              //           let ret = new Log(key, rec);
              //           cache.set(key, ret);
              //           return ret;
              //         });
            });
  }

  static make(sub_rec, options = {}) {
    let { key } = options;

    return Promise
            .try(() => {
              let date  = new Date().getTime()
                , rec   = _.extend({ key, date }, sub_rec)
                , str   = JSON.stringify(rec)
                ;

                // todo [akamel] for now we let the socket id act as the key for new items
                // key   = randtoken.generate(64)

                return redis
                        .setnxAsync(key, str)
                        .then((res) => {
                          // todo [akamel] restore key collision detection
                          // if (res == 0) {
                          //   throw new Error('key collision');
                          // }

                          let ret = new Log(key, rec);
                          cache.set(key, ret);
                          return ret;
                        });
            });
  }

  // todo [akamel] if we didn't get a chunk yet, and we disconnect we woudld have a record to recover with and get key mismatch
  static acl(key, options = {}) {
    let { rec, by, on } = options;

    // winston.info(`acl: ${key} on ${on} by ${by}`);
    return Promise
            .try(() => {
              return Log.get(key);
            })
            .catch((err) => {
              // not found
              winston.info(`acl: not found ${key}`);

              // if the rec doesn't exist (no one owns this id, and the id matches the asker's id, create)
              if (key == on) {
                winston.info(`acl: make ${key} for ${on}`);
                return Log.make(rec, { key });
              }

              // if (key == on) {
              winston.info(`acl-bypass: make ${key} for ${on}`);
              return Log.make(rec, { key });
              // }

              winston.error(`acl: [key mismatch] ${key} on ${on} by ${by}`);
              throw new Error('key mismatch');
            })
            // .then((log) => {
            //   return log;
            // });
  }

  static chunk_to_html(chunk) {
    return new ansi_to_html().toHtml(chunk.text);
  }

  static dirname() {
    return disk;
  }
}

module.exports = Log;
