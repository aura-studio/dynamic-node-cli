import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import yazl from "yazl";
import { callMeta, META_FILE, readMeta } from "../src/meta/meta.js";
import { Builder } from "../src/build/builder.js";

test("reads static meta from libnode zip", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dynamic-node-cli-test-"));
  try {
    const zipPath = path.join(dir, "libnode_team_app_v1.0.0.zip");
    const meta = sampleMeta();
    await writeZip(zipPath, {
      [META_FILE]: JSON.stringify(meta),
      "bundle.js": "exports.Tunnel = { invoke() {}, meta() { return '{}'; } };",
    });

    assert.deepEqual(await readMeta(zipPath), meta);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("calls Tunnel.Meta from libnode zip", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dynamic-node-cli-test-"));
  try {
    const zipPath = path.join(dir, "libnode_team_app_v1.0.0.zip");
    const meta = sampleMeta();
    await writeZip(zipPath, {
      [META_FILE]: JSON.stringify(meta),
      "bundle.js": `exports.Tunnel = {
        invoke() {},
        Meta() { return ${JSON.stringify(JSON.stringify(meta))}; }
      };`,
    });

    assert.deepEqual(await callMeta(zipPath), meta);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("build meta uses source module version and overrides package meta", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dynamic-node-cli-test-"));
  try {
    const moduleRoot = path.join(dir, "source-module");
    const appDir = path.join(moduleRoot, "app");
    await fs.promises.mkdir(appDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(moduleRoot, "package.json"),
      JSON.stringify({ name: "dynamic-node-cli-test-module", version: "2.3.4" }, null, 2) + "\n",
      "utf8",
    );
    await fs.promises.writeFile(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "dynamic-node-cli-test-app", version: "9.9.9", type: "commonjs" }, null, 2) + "\n",
      "utf8",
    );
    await fs.promises.writeFile(
      path.join(appDir, "tunnel.js"),
      `"use strict";
module.exports = {
  init() {},
  invoke() { return ""; },
  Meta() {
    return JSON.stringify({
      dynamic: { module: "package-meta", package: "leak", version: "9.9.9", built: "bad" },
      toolchain: { os: "bad", arch: "bad", compiler: "bad", variant: "bad" }
    });
  },
  close() {}
};
`,
      "utf8",
    );

    for (const variant of ["bundle", "full"]) {
      const outDir = path.join(dir, "warehouse", variant);
      const builder = new Builder({
        name: `team_app_${variant}`,
        sourcePath: appDir,
        sourceModule: moduleRoot,
        sourcePackage: "app",
        sourceVersion: "latest",
        version: "latest",
        house: path.join(dir, "warehouse"),
        environment: `test_${variant}`,
        variant,
        os: "test-os",
        arch: "test-arch",
        compiler: "node-test",
        dir: outDir,
      });
      await builder.build();

      const zipPath = path.join(outDir, `libnode_team_app_${variant}.zip`);
      const expected = {
        dynamic: {
          module: moduleRoot,
          version: "2.3.4",
        },
        toolchain: {
          os: "test-os",
          arch: "test-arch",
          compiler: "node-test",
          variant,
        },
      };

      assertMetaShape(await readMeta(zipPath), expected);
      assertMetaShape(await callMeta(zipPath), expected);
    }
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

function sampleMeta() {
  return {
    dynamic: {
      module: "@scope/app",
      version: "v1.0.0",
      built: "2026-05-23T00:00:00Z",
    },
    toolchain: {
      os: "ubuntu22.04",
      arch: "amd64v1",
      compiler: "node22.11.0",
      variant: "bundle",
    },
  };
}

function assertMetaShape(meta, expected) {
  assert.deepEqual(Object.keys(meta.dynamic).sort(), ["built", "module", "version"]);
  assert.deepEqual(Object.keys(meta.toolchain).sort(), ["arch", "compiler", "os", "variant"]);
  assert.equal(meta.dynamic.module, expected.dynamic.module);
  assert.equal(meta.dynamic.version, expected.dynamic.version);
  assert.match(meta.dynamic.built, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.deepEqual(meta.toolchain, expected.toolchain);
}

async function writeZip(zipPath, entries) {
  const zipfile = new yazl.ZipFile();
  for (const [name, value] of Object.entries(entries)) {
    zipfile.addBuffer(Buffer.from(value), name);
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    out.on("close", resolve);
    out.on("error", reject);
    zipfile.outputStream.on("error", reject);
    zipfile.outputStream.pipe(out);
    zipfile.end();
  });
}
