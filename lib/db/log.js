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
  , ansi_to_html  = require('ansi-to-html');
  ;

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

  write_stream() {
    return output(this.filename());
  }

  read_rec() {
    return redis
            .getAsync(this.id)
            .then(JSON.parse);
  }

  write_rec(spec = {}, meta = {}) {
    let key = this.id;

    return redis
            .setnxAsync(key, JSON.stringify({ key, meta, spec }));
  }

  write(payload) {
    let filename  = this.filename()
      , out       = output(filename, { flags : 'a' })
      ;

    let { time, chunk, type}  = payload
      , text                  = chunk.toString('utf8')
      , line                  = JSON.stringify({ time, text, type }) + '\n'
      ;

    out.write(line);
  }

  read() {
    let filename  = this.filename()
      , norm      = path.normalize(filename)
      ;

    if (_.startsWith(norm, '..')) {
      return;
    }

    return fs.createReadStream(filename);
  }

  chunks(on_chunk, on_end) {
    let stream = this.read();

    if (!stream) {
      on_end(new Error('not found'));
      return;
    }

    byline(stream)
      .on('data', (line) => {
        let obj = JSON.parse(line);

        on_chunk(obj);
      })
      .on('end', () => {
        on_end();
      })
      .on('error', (err) => {
        on_end(new Error('file not found'));
      });
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

  static chunk_to_html(chunk) {
    return new ansi_to_html().toHtml(chunk.text);
  }
}

module.exports = Log;
