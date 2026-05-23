import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractZip, listZipEntries, readZipEntry } from "./zip.js";

export const META_FILE = "dynamic-meta.json";
export const META_KEYS = ["module", "version", "built", "os", "arch", "compiler", "variant"];

export function createBuildMeta(config) {
  return {
    dynamic: {
      module: config.sourceModule,
      package: config.sourcePackage,
      version: config.sourceVersion,
      built: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
    toolchain: {
      os: config.os,
      arch: config.arch,
      compiler: config.compiler,
      variant: config.variant,
    },
  };
}

export function stringifyMeta(meta) {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

export function flattenMeta(meta) {
  return {
    module: meta?.dynamic?.module ?? "",
    version: meta?.dynamic?.version ?? "",
    built: meta?.dynamic?.built ?? "",
    os: meta?.toolchain?.os ?? "",
    arch: meta?.toolchain?.arch ?? "",
    compiler: meta?.toolchain?.compiler ?? "",
    variant: meta?.toolchain?.variant ?? "",
  };
}

export async function readMeta(targetPath) {
  const stat = await fs.promises.stat(targetPath);
  if (stat.isDirectory()) {
    return readMetaJson(path.join(targetPath, META_FILE));
  }
  if (path.basename(targetPath) === META_FILE || path.extname(targetPath) === ".json") {
    return readMetaJson(targetPath);
  }

  const data = await readZipEntry(targetPath, META_FILE);
  if (!data) {
    throw new Error(`${META_FILE} not found in ${targetPath}`);
  }
  return JSON.parse(data.toString("utf8"));
}

export async function inspectArtifact(targetPath) {
  const stat = await fs.promises.stat(targetPath);
  if (stat.isDirectory()) {
    return inspectDirectory(targetPath);
  }
  if (path.extname(targetPath) === ".zip") {
    return listZipEntries(targetPath);
  }
  return [{ name: path.basename(targetPath), compressedSize: stat.size, uncompressedSize: stat.size }];
}

export async function callMeta(targetPath) {
  const stat = await fs.promises.stat(targetPath);
  if (stat.isDirectory()) {
    return callMetaFromDirectory(targetPath);
  }
  if (path.extname(targetPath) === ".zip") {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dynamic-node-meta-"));
    try {
      await extractZip(targetPath, tmpDir);
      return await callMetaFromDirectory(tmpDir);
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }
  return callMetaFromFile(targetPath);
}

export function printMeta(meta, { json = false } = {}) {
  if (json) {
    console.log(stringifyMeta(meta).trimEnd());
    return;
  }

  const flat = flattenMeta(meta);
  for (const key of META_KEYS) {
    console.log(`${key}: ${flat[key] ?? ""}`);
  }
}

async function readMetaJson(filePath) {
  const data = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(data);
}

async function inspectDirectory(dir) {
  const entries = [];
  await walk(dir, async (filePath) => {
    const stat = await fs.promises.stat(filePath);
    entries.push({
      name: path.relative(dir, filePath).split(path.sep).join("/"),
      compressedSize: stat.size,
      uncompressedSize: stat.size,
    });
  });
  return entries;
}

async function callMetaFromDirectory(dir) {
  const bundlePath = path.join(dir, "bundle.js");
  if (await exists(bundlePath)) {
    return callMetaFromFile(bundlePath);
  }

  const packageJsonPath = path.join(dir, "package.json");
  if (await exists(packageJsonPath)) {
    const pkg = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
    const mainFile = pkg.main || "index.js";
    return callMetaFromFile(path.join(dir, mainFile));
  }

  return callMetaFromFile(path.join(dir, "index.js"));
}

async function callMetaFromFile(filePath) {
  const mod = await import(pathToFileURL(path.resolve(filePath)).href);
  const tunnel = await resolveTunnel(mod);
  const metaFn = tunnel?.Meta ?? tunnel?.meta;
  if (typeof metaFn !== "function") {
    throw new Error("Tunnel does not implement Meta()/meta()");
  }

  const result = await metaFn.call(tunnel);
  if (typeof result === "string") {
    return JSON.parse(result);
  }
  return result;
}

async function resolveTunnel(mod) {
  if (isTunnel(mod?.Tunnel)) {
    return mod.Tunnel;
  }
  if (typeof mod?.New === "function") {
    return mod.New();
  }
  if (isTunnel(mod?.default)) {
    return mod.default;
  }
  if (isTunnel(mod?.default?.Tunnel)) {
    return mod.default.Tunnel;
  }
  if (typeof mod?.default?.New === "function") {
    return mod.default.New();
  }
  if (typeof mod?.default === "function") {
    return mod.default();
  }
  throw new Error("module does not export Tunnel, New, or default tunnel");
}

function isTunnel(value) {
  return Boolean(value && (typeof value.Invoke === "function" || typeof value.invoke === "function"));
}

async function exists(filePath) {
  try {
    await fs.promises.stat(filePath);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

async function walk(root, visit) {
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(current, visit);
      continue;
    }
    await visit(current);
  }
}
