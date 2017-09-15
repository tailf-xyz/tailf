var config    = require('config-url')
  , winston   = require('winston')
  , Promise   = require('bluebird')
  , http      = require('./lib')
  ;

Promise.longStackTraces();

process.on('uncaughtException', function (err) {
  console.error(err.stack || err.toString());
});

let { PORT } = process.env;

function main() {
  let port = PORT || config.getUrlObject('tailf').port;
  return http
          .listen({ port })
          .then(() => {
            winston.info('taskmill-core-tailf [started] :%d', port);
          });
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
