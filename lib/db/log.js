'use strict';

var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , byline        = require('byline')
  , output        = require('create-output-stream')
  , fs            = require('fs')
  , path          = require('path')
  , asciicast     = require('./asciicast')
  , { redis }     = require('./redis')
  , ansi_to_html  = require('ansi-to-html')
  , lru_cache     = require('lru-cache')
  ;

var cache = lru_cache({ max : 1000, maxAge : 5 * 60 * 1000 });

var writers = lru_cache({ max : 1000, maxAge : 2 * 60 * 1000, dispose : (key, p) => p.then(s => s.end()) });
var readers = lru_cache({ max : 1000, maxAge : 2 * 60 * 1000, dispose : (key, p) => p.then(s => s.close()) });

class Log {
  constructor(id) {
    this.id = id;
  }

  key() {
    return this.id;
  }

  filename() {
    return `./disk/${this.key()}`;
  }

  writer() {
    let key = this.id;

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
    let key = this.id;

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

  acl() {
    return this
            .read_rec()
            .catch((err) => {})
            .then((rec) => {
              if (!rec) {
                return;
              }

              return rec;
            });
  }

  read_rec() {
    return redis
            .getAsync(this.id)
            .then(JSON.parse);
  }

  write_rec(obj) {
    let key   = this.id
      , date  = new Date().getTime()
      , rec   = _.extend({ key, date }, obj)
      , str   = JSON.stringify(rec)
      ;

    return redis.setnxAsync(key, str);
  }

  read_size() {
    let key = `size:${this.id}`;
    return redis.getAsync(key);
  }

  inc_size(inc) {
    let key = `size:${this.id}`;
    return redis.incrbyAsync(key, inc);
  }

  stats() {
    return Promise
            .all([ this.read_rec(), this.read_size() ])
            .spread((rec, size) => {
              if (!rec) {
                throw new Error('not found')
              }

              let { key } = rec;
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

  write_asciicast(res, options = {}) {
    let { spec }  = options
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
    let ret = cache.get(key);
    if (!ret) {
      ret = new Log(key);
      cache.set(key, ret);
    }

    return ret;
  }

  static chunk_to_html(chunk) {
    return new ansi_to_html().toHtml(chunk.text);
  }
}

module.exports = Log;
