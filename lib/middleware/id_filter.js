
module.exports = (req, res, next) => {
  if (/^\/[a-zA-Z0-9]{32}/.test(req.path)) {
    next();
    return;
  }

  res.end();
}
