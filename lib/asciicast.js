
const schema = {
    version     : 1
  , stdout      : ['STDOUT']
  , width       : '[WIDTH]'
  , height      : '[HEIGHT]'
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

function open(meta) {
  let { width, height } = meta;

  let ret = o;

  ret.replace(`"[WIDTH]"`, width);
  ret.replace(`"[HEIGHT]"`, height);

  return ret;
}

function close(duration) {
  return c.replace(`"[DURATION]"`, duration);
}

module.exports = {
    open
  , close
};
