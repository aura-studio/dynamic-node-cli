const http = require("node:http");
const wire = require("@aura-studio/wire-node");

const app = (req, res) => {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({
    message: "hello wire-node",
    method: req.method,
    url: req.url,
    target: req.headers["x-dynamic-node-target"] || "",
  }));
};

// The same app variable can be used by native Node HTTP and by wire-node.
// That is the compatibility contract this example exercises.
const server = http.createServer(app);
const Tunnel = wire.new(app);

function New() {
  return wire.new(app);
}

if (require.main === module) {
  server.listen(3000, () => {
    console.log("wire example listening on http://127.0.0.1:3000");
  });
}

module.exports = { app, server, Tunnel, New };
