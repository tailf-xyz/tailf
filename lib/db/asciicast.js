
const schema = {
    version     : 1
  , width       : '[WIDTH]'
  , height      : '[HEIGHT]'
  , stdout      : ['STDOUT']
  , command     : '/bin/bash'
  , title       : ''
  , env         : {
        TERM    : 'xterm-256color'
      , SHELL   : '/bin/bash'
    }
  , duration    : '[DURATION]'
};

const tmpl = JSON.stringify(schema);

let split = tmpl.split(`"STDOUT"`)
  , o     = `${split[0]}\n`
  , c     = `\n${split[1]}\n`
  ;

function open(meta = {}) {
  let { columns = 80, rows = 24 } = meta;

  let ret = o;

  ret = ret.replace(`"[WIDTH]"`, columns);
  ret = ret.replace(`"[HEIGHT]"`, rows);

  return ret;
}

function close(duration) {
  return c.replace(`"[DURATION]"`, duration);
}

module.exports = {
    open
  , close
};
