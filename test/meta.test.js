import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import yazl from "yazl";
import { callMeta, META_FILE, readMeta } from "../src/meta/meta.js";

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

function sampleMeta() {
  return {
    dynamic: {
      module: "@scope/app",
      package: ".",
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
