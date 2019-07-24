const winston = require('winston');

const errorStackFormat = winston.format(info => {
  if (info instanceof Error) {
    return Object.assign({}, info, {
      stack: info.stack,
      message: info.message
    })
  }

  return info
})

const format = winston.format.combine(errorStackFormat(), winston.format.simple());

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console({ format })
  ]
});

module.exports = { logger };