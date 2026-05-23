const os = require("node:os");

const Tunnel = {
  Init() {},
  Invoke(route, request = "{}") {
    const input = JSON.parse(request || "{}");
    return JSON.stringify({
      route,
      message: `hello ${input.name || "dynamic-node"}`,
      platform: os.platform(),
      arch: os.arch(),
      node: process.version,
    });
  },
  Close() {},
};

function New() {
  return Tunnel;
}

if (require.main === module) {
  console.log(Tunnel.Invoke("/hello", JSON.stringify({ name: "manual" })));
}

module.exports = { Tunnel, New };
