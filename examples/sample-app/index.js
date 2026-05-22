const os = require("node:os");

function hello(name = "dynamic-node") {
  return {
    message: `hello ${name}`,
    platform: os.platform(),
    arch: os.arch(),
    node: process.version,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(hello(), null, 2));
}

module.exports = hello;
