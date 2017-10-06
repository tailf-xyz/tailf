var _             = require('lodash')
  , Promise       = require('bluebird')
  , config        = require('config')
  , winston       = require('winston')
  , passport      = require('passport')
  , Strategy      = require('passport-jwt').Strategy
  , ExtractJwt    = require('passport-jwt').ExtractJwt
  ;

const pub = config.get('jwt.public');

var opts = {
    jwtFromRequest  : ExtractJwt.fromUrlQueryParameter('token')
  , algorithms      : ['RS256']
  , secretOrKey     : pub
  , issuer          : 'tailf.io'
  // opts.audience = 'yoursite.net';
}

passport.use(new Strategy(opts, (payload = {}, done) => {
  let { sub, sub_type, iss } = payload;

  if (iss != 'tailf.io') {
    done(null, false);
    return;
  }

  done(null, payload);
}));

module.exports = {
    middleware : passport.authenticate('jwt', { session: false })
};
