var config    = require('config-url')
  , winston   = require('winston')
  , Promise   = require('bluebird')
  , http      = require('./lib')
  ;

Promise.longStackTraces();

process.on('uncaughtException', function (err) {
  console.error(err.stack || err.toString());
});

function main() {
  return http
          .listen({ port : config.getUrlObject('tailf').port })
          .then(() => {
            winston.info('taskmill-core-tailf [started] :%d', config.getUrlObject('tailf').port);
          });
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
