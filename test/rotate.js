let { Log }   = require('tailf.io-sdk')
  , bytes     = require('bytes')
  , _         = require('lodash')
  , winston   = require('winston')
  , config    = require('config')
  ;

let limit   = bytes('10kb')
  , rotate  = true
  ;

Log
  .open({ rotate, limit, host : config.get('tailf.origin') })
  .then((log) => {
    // size, limit, keep_open, rotate = false
    // let pub = new Pub(limit, rotate);

    winston.info(log.identity());

    let i = 0;

    setInterval(() => {
      let text = _.times(100, () => _.padStart(i++, 20, '0')).join('\n');

      log.log(text);
    }, 50);
  })
  // .catch((err) => {
  //   console.error(err);
  // })
  // .finally(() => {
  //   process.exit();
  // })
