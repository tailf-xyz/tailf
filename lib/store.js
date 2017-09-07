var _             = require('lodash')
  , Promise       = require('bluebird')
  , output        = require('create-output-stream')
  , fs            = require('fs')
  // , hash          = require('object-hash')
  ;

function key(id) {
  return id;
}

function filename(id) {
  return `./disk/${key(id)}`;
}

function write_stream(id) {
  return output(filename(id));
}

function read_stream(id) {
  return fs.createReadStream(filename(id));
}

module.exports = {
    key
  , filename
  , write_stream
  , read_stream
};
