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

  res.send(`
    <html>
      <head>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/asciinema-player/2.4.1/asciinema-player.css" integrity="sha256-U2HhSg0ho9FDR5zC8i+mH5P2RygjUFZCVB8hA5GLB/w=" crossorigin="anonymous" />
      </head>
      <body>
        <asciinema-player src="/log/${id}/json"></asciinema-player>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/asciinema-player/2.4.1/asciinema-player.js" integrity="sha256-Puk+D1373+/JkdxNQqivufEPzNSQI9IS1VgJCIYDE+k=" crossorigin="anonymous"></script>
      </body>
    </html>
  `);
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

// `
//   <html>
//     <body>
//       ${arr.map((o) => {
//         return '<p><a href="/log/' + o.key + '/play">' + o.key + '</a></p>';
//       })}
//     </body>
//   </html>
// `

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
            , frmt            = [ obj.time, obj.text ]
            , is_first_line   = !first
            ;

          last = obj;

          if (is_first_line) {
            first = obj;
            res.write(asciicast.open(spec));
            res.write(`  `);
          } else {
            res.write(`, `);
          }

          frmt[0] = (last.time - first.time) / 1000;

          res.write(`${JSON.stringify(frmt)}\n`);
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

module.exports = {
    play
  , json
  , ls
};
