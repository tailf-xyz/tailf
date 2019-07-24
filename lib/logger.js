const winston = require('winston');

const { combine, timestamp, printf, colorize, splat } = winston.format;

const err_formater = winston.format(info => {
  if (info instanceof Error) {
    return Object.assign({}, info, {
      stack: info.stack,
      message: info.message
    });
  }

  return info;
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(colorize(), timestamp(), splat(), err_formater(), printf(info => `${info.timestamp} ${info.level}: ${info.message} ${info.stack? info.stack : ''}`)),
  defaultMeta: { service: 'tailf.io' },
  transports: [
    new winston.transports.Console({})
  ]
});

module.exports = { logger };