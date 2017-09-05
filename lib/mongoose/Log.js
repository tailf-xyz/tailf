var Promise     = require('bluebird')
  , winston     = require('winston')
  , _           = require('lodash')
  , mongoose    = require('mongoose')
  , uuidv4      = require('uuid/v4')
  , Schema      = mongoose.Schema
  ;

mongoose.Promise = Promise;

var schema = new Schema({
  //   remote        : String
    metadata      : Schema.Types.Mixed
  , uuid          : { type : String, required : true, default : uuidv4 }
  , createdAt     : { type : Date, required : true, default : Date.now }
  , updatedAt     : Date
}, { collection : 'log', timestamps : true });

var Log = mongoose.model('Log', schema);

module.exports = Log;
