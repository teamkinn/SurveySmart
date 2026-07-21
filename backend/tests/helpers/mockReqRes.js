// Minimal fake Express res object for unit-testing controllers/middleware
// without pulling in a full HTTP server or a mocking library.
function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (payload) {
    res.body = payload;
    return res;
  };
  return res;
}

module.exports = { mockRes };
