var _             = require('lodash')
  , Promise       = require('bluebird')
  , output        = require('create-output-stream')
  , sha1          = require('sha1')
  , fs            = require('fs')
  // , hash          = require('object-hash')
  ;

function key(id) {
  // return hash.sha1(id);
  // return sha1(id);
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
