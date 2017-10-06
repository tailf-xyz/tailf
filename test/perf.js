const cluster = require('cluster');

let numCPUs = 50;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  let _             = require('lodash')
    , randtoken     = require('rand-token')
    , { Producer }  = require('taskmill-core-tailf')
    ;

  let s = (new Producer()).stream({});

  setInterval(() => {
    for(let i = 0; i < 10; i++) {
      let chunk = _.times(1000, () => randtoken.generate(64)).join();
      // console.log(i, chunk)
      s.write({ chunk });
    }
  }, 10)

  console.log(`Worker ${process.pid} started`);
}
