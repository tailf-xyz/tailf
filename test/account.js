let Account = require('../lib/db/account');

Account
  .make({ email : 'ahmed.kamel@gmail.com', limit_per_file : 26214400, limit : 214748364800 })
  .then((account) => {
    console.dir(account);
  })
  .catch((err) => {
    console.error(err);
  })
  .finally(() => {
    process.exit();
  })
