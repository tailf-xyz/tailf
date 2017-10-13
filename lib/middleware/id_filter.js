
module.exports = (req, res, next) => {
  if (req.path == '/favicon.ico') {
    res.end();
    return;
  }

  next();
}
