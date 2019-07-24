var config_url  = require('config-url')
  , Promise     = require('bluebird')
  , { logger }  = require('./lib/logger')
  , http        = require('./lib')
  ;

Promise.longStackTraces();

process.on('uncaughtException', function (err) {
  logger.error(err);
});

process.on('unhandledRejection', (reason, p) => {
  logger.error(reason);
});

function main() {
  let port = config_url.url('tailf').port;
  return http
          .listen({ port })
          .then(() => {
            logger.info('tailf.io [started] :%d', port);
          });
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
