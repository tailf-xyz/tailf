var fs    = require('fs')
  , bytes = require('bytes')
  , ms    = require('ms')
  ;

module.exports = {
  jwt : {
    //   key       : fs.readFileSync('/home/nodejs/.key/jwt/key', 'utf-8')
    // , public    : fs.readFileSync('/home/nodejs/.key/jwt/key.pem', 'utf-8')
      expiresIn : 14400 // 60 * 60 * 4 -- 4 hours
  },
  tailf : {
    chunk : {
      size : bytes('50kb')
    },
    metering : {
      '*' : {
          limit_per_file  : bytes('100kb')
        , limit_metadata  : bytes('20kb')
        , ttl             : ms('15d')
      }
    }
  }
};
