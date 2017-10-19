var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , { redis }     = require('../db/redis')
  , redisscan     = require('redisscan')
  // , Log           = require('../db/log')
  // , humanize      = require('humanize')
  // , asciicast     = require('../asciicast')
  ;

function index(req, res, next) {
  // let { id } = req.params;

  res.render('account/index', { });
}

module.exports = {
    index
};
