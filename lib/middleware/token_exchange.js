var Promise       = require('bluebird')
  , _             = require('lodash')
  , config        = require('config')
  , winston       = require('winston')
  , authorization = require('auth-header')
  , jwt           = require('jsonwebtoken')
  , Log           = require('../db/log')
  ;

const CERT = config.get('jwt.key');

module.exports = (req, res, next) => {
  Promise
    .resolve(req.get('Authorization') || req.query['Authorization'])
    .then((header) => {
      if (header) {
        let auth = authorization.parse(header);

        if (auth.scheme === 'Bearer') {
          if (_.size(auth.token) == 32) {
            let sub       = auth.token // we set token to same as owner_id
              , token     = jwt.sign({ sub, sub_type : 'account' }, CERT, { algorithm : 'RS256', expiresIn : '6h', issuer : 'tailf.io' })
              ;

            req.bearer = `Bearer ${token}`;
            req.headers['authorization'] = req.bearer;
          }
        }
      }
    })
    .asCallback(next);
}
