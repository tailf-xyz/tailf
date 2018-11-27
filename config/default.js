var fs    = require("fs"),
    bytes = require("bytes"),
    ms    = require("ms");

module.exports = {
  jwt: {
    key: null,
    public: null,
    expiresIn: ms("4h") / 1000
  },
  tailf: {
    port: 8654,
    origin: "https://tailf.io",
    ls_limit: 50,
    log: {
      dirname: "./disk"
    },
    chunk: {
      size: bytes("50kb")
    },
    redis: {
      host: "localhost",
      port: 6379,
      password: null,
      db: 0,
      db_index: 1
    },
    metering: {
      "*": {
        limit_per_file: bytes("100kb"),
        limit_metadata: bytes("20kb"),
        ttl: ms("15d")
      }
    }
  }
};
