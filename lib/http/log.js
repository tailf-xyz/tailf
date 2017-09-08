var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , byline        = require('byline')
  , { redis }     = require('../db/redis')
  , redisscan     = require('redisscan')
  , store         = require('../store')
  , asciicast     = require('../asciicast')
  ;

function play(req, res, next) {
  let { id } = req.params;

  res.render('log/play', { url : `/log/${id}/json` });
}

function ls(req, res, next) {
  let { match } = req.body;

  let arr = [];
  redisscan({
      redis
    // pattern: 'awesome:key:prefix:*',
    , keys_only: false
    , each_callback : (type, key, subkey, length, value, cb) => {
        // console.log(type, key, subkey, length, value);

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

function json(req, res, next) {
  let { id } = req.params;

  redis
    .getAsync(id)
    .then((result) => {
      let rec       = JSON.parse(result)
        , { spec }  = rec
        , first     = undefined
        , last      = undefined
        ;

      byline(store.read_stream(id))
        .on('data', (line) => {
          let obj             = JSON.parse(line)
            , frame           = [ 0, obj.text ]
            , is_first_line   = !first
            ;

          if (is_first_line) {
            first = obj;
            res.write(asciicast.open(spec));
            res.write(`  `);
          } else {
            res.write(`, `);
            frame[0] = (obj.time - last.time) / 1000;
          }

          last = obj;
          res.write(`${JSON.stringify(frame)}\n`);
        })
        .on('end', () => {
          let duration = (last.time - first.time) / 1000;

          res.write(asciicast.close(duration));
          res.end();
        })
        .on('error', (err) => {
          res.status(500).send({ message : 'file not found' });
        })
        ;
    })
    .catch((err) => {
      res.status(500).send({ message : 'not found' });
    });
}

function text(req, res, next) {
  let { id } = req.params;

  redis
    .getAsync(id)
    .then((result) => {
      let rec = JSON.parse(result);

      byline(store.read_stream(id))
        .on('data', (line) => {
          let obj = JSON.parse(line);

          res.write(`${obj.text}`);
        })
        .on('end', () => {
          res.end();
        })
        .on('error', (err) => {
          res.status(500).send({ message : 'file not found' });
        })
        ;
    })
    .catch((err) => {
      res.status(500).send({ message : 'not found' });
    });
}

function html(req, res, next) {
  let { id } = req.params;

  redis
    .getAsync(id)
    .then((result) => {
      let rec = JSON.parse(result);

      let chunks = [];
      byline(store.read_stream(id))
        .on('data', (line) => {
          let obj = JSON.parse(line);

          chunks.push(obj.text);
        })
        .on('end', () => {
          res.render('log/html', { chunks });
        })
        .on('error', (err) => {
          res.status(500).send({ message : 'file not found' });
        })
        ;
    })
    .catch((err) => {
      res.status(500).send({ message : 'not found' });
    });
}



module.exports = {
    play
  , json
  , text
  , html
  , ls
};
