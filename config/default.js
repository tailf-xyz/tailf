var fs    = require('fs')
  , bytes = require('bytes')
  ;

module.exports = {
  jwt : {
      key       : fs.readFileSync('/Users/ahmedkamel/Documents/GitHub/taskmill-ops/deploy/saltstack/file_root/.key/jwt/key', 'utf-8')
    , public    : fs.readFileSync('/Users/ahmedkamel/Documents/GitHub/taskmill-ops/deploy/saltstack/file_root/.key/jwt/key.pem', 'utf-8')
    , expiresIn : 14400 // 60 * 60 * 4 -- 4 hours
  },
  tailf : {
    chunk : {
      size : bytes('50kb')
    },
    metering : {
      '*' : {
          limit_per_file : bytes('100kb')
        , limit_metadata : bytes('20kb')
      }
    }
  }
};
