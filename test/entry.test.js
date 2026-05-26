import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveEntryPath } from "../src/build/entry.js";

test("resolves package main from a source directory", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dynamic-node-entry-test-"));
  try {
    await fs.promises.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ type: "commonjs", main: "custom.js" }, null, 2) + "\n",
    );
    await fs.promises.writeFile(path.join(dir, "custom.js"), "module.exports = {};\n");
    await fs.promises.writeFile(path.join(dir, "tunnel.js"), "module.exports = {};\n");

    const entry = await resolveEntryPath(dir);

    assert.equal(entry.relative, "custom.js");
    assert.equal(entry.absolute, path.join(dir, "custom.js"));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("falls back to tunnel.js before index.js", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dynamic-node-entry-test-"));
  try {
    await fs.promises.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
    );
    await fs.promises.writeFile(path.join(dir, "tunnel.js"), "module.exports = {};\n");
    await fs.promises.writeFile(path.join(dir, "index.js"), "module.exports = {};\n");

    const entry = await resolveEntryPath(dir);

    assert.equal(entry.relative, "tunnel.js");
    assert.equal(entry.absolute, path.join(dir, "tunnel.js"));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("uses configured entry when provided", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dynamic-node-entry-test-"));
  try {
    await fs.promises.writeFile(path.join(dir, "custom.js"), "module.exports = {};\n");
    await fs.promises.writeFile(path.join(dir, "tunnel.js"), "module.exports = {};\n");

    const entry = await resolveEntryPath(dir, { entry: "custom.js" });

    assert.equal(entry.relative, "custom.js");
    assert.equal(entry.absolute, path.join(dir, "custom.js"));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
