import assert from "node:assert/strict";
import test from "node:test";
import { validateConfig } from "../src/config/config.js";

test("config rejects underscores to match dynamic-cli", () => {
  const config = sampleConfig();
  config.procedures[0].target.namespace = "bad_name";

  assert.throws(
    () => validateConfig(config),
    /target\.namespace contains invalid characters/,
  );
});

test("config keeps Node bundle and full variants", () => {
  const bundleConfig = sampleConfig();
  validateConfig(bundleConfig);

  const fullConfig = sampleConfig();
  fullConfig.environments[0].toolchain.variant = "full";
  validateConfig(fullConfig);
});

function sampleConfig() {
  return {
    environments: [
      {
        name: "default",
        toolchain: {
          os: "ubuntu22.04",
          arch: "amd64v1",
          compiler: "node22.11.0",
          variant: "bundle",
        },
        warehouse: {
          local: "/tmp/warehouse",
          remote: ["s3://bucket"],
        },
      },
    ],
    procedures: [
      {
        name: "app",
        environment: "default",
        source: {
          module: "./src",
          package: "app",
          version: "latest",
        },
        target: {
          namespace: "team",
          package: "app",
          version: "v1.0.0",
        },
      },
    ],
  };
}
