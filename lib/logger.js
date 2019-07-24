const winston = require('winston');

const logger = loggercreateLogger({
  level: 'info',
  format: loggerformat.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    logger.add(new loggertransports.Console({ format: loggerformat.simple() }));
  ]
});

module.exports = { logger };