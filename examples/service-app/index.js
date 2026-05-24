const service = require("@aura-studio/service-node");

class ExampleService {
  meta() {
    return {
      kind: "service-node-example",
      routes: ["/greet-user", "/echo"],
    };
  }

  greetUser(ctx, payload = {}) {
    ctx.setResponseMeta("handler", "greetUser");
    return {
      message: `hello ${payload.name || "service-node"}`,
      route: ctx.route,
    };
  }

  echo(ctx, payload) {
    ctx.setResponseMeta("handler", "echo");
    return payload;
  }
}

const app = new ExampleService();

// dynamic-node-cli still packages a normal Tunnel target. The target project
// owns the service-node dependency and performs service.new(app) itself.
const Tunnel = service.new(app);

function New() {
  return service.new(app);
}

if (require.main === module) {
  const request = {
    meta: { caller: "manual" },
    data: Buffer.from(JSON.stringify({ name: "manual" })).toString("base64"),
  };
  Tunnel.Invoke("/greet-user", JSON.stringify(request)).then((result) => {
    console.log(result);
  });
}

module.exports = { app, Tunnel, New };
