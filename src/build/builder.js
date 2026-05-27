import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import yazl from "yazl";
import { createBuildMeta, META_FILE, stringifyMeta } from "../meta/meta.js";
import { resolveEntryPath } from "./entry.js";
import { validateTunnelEntry } from "./validate-tunnel.js";

export class Builder {
  constructor(config) {
    this.config = config;
    this.sourcePath = null;
    this.sourceModuleRoot = null;
    this.entry = null;
    this.meta = null;
    this.netrcState = null;
  }

  async build() {
    console.log("start...");
    try {
      await fs.promises.mkdir(this.config.dir, { recursive: true, mode: 0o755 });
      await this.writeNetrcFromEnv();
      this.sourcePath = await this.prepareSourcePath();
      this.npmInstall();
      await this.validateTunnel();
      this.meta = await this.createMeta();

      if (this.config.variant === "full") {
        await this.buildFull();
      } else {
        await this.buildBundle();
      }
    } finally {
      await this.restoreNetrc();
      console.log("done!");
    }
  }

  npmInstall() {
    const srcPath = this.resolveSourcePath();
    console.log(`npm install in ${srcPath}`);

    const result = runNpm(["install"], srcPath);

    if (result.error || result.status !== 0) {
      throw new Error(`npm install failed: ${result.error?.message ?? result.status}`);
    }
  }

  async buildBundle() {
    const entry = await this.resolveEntry();
    const meta = this.meta ?? await this.createMeta();
    const appBundlePath = path.join(this.config.dir, "dynamic-node-app.cjs");
    const wrapperPath = path.join(this.config.dir, "bundle.js");

    console.log(`esbuild bundle ${entry.absolute}`);

    await esbuild({
      entryPoints: [entry.absolute],
      bundle: true,
      outfile: appBundlePath,
      platform: "node",
      format: "cjs",
      write: true,
      logLevel: "info",
    });
    await fs.promises.writeFile(
      wrapperPath,
      createCjsWrapper("./dynamic-node-app.cjs", meta),
      "utf8",
    );
    await fs.promises.writeFile(
      path.join(this.config.dir, "package.json"),
      JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
      "utf8",
    );

    const zipName = `libnode_${this.config.name}.zip`;
    const zipPath = path.join(this.config.dir, zipName);
    await this.createBundleZip(zipPath, meta);

    const backupPath = `${zipPath}.${timestampSuffix()}`;
    await fs.promises.copyFile(zipPath, backupPath);

    console.log(`output: ${zipPath}`);
  }

  async buildFull() {
    const srcPath = this.resolveSourcePath();
    const meta = this.meta ?? await this.createMeta();

    const zipName = `libnode_${this.config.name}.zip`;
    const zipPath = path.join(this.config.dir, zipName);

    console.log(`full zip ${srcPath} -> ${zipPath}`);
    await this.stageFullDirectory(srcPath, meta);
    await this.createFullZip(zipPath, srcPath, meta);

    const backupPath = `${zipPath}.${timestampSuffix()}`;
    await fs.promises.copyFile(zipPath, backupPath);

    console.log(`output: ${zipPath}`);
  }

  resolveSourcePath() {
    if (this.sourcePath) {
      return this.sourcePath;
    }
    if (path.isAbsolute(this.config.sourcePath)) {
      return this.config.sourcePath;
    }
    return path.join(process.cwd(), this.config.sourcePath);
  }

  async prepareSourcePath() {
    const localSourcePath = this.resolveSourcePath();
    if (await exists(localSourcePath)) {
      this.sourceModuleRoot = this.resolveLocalSourceModuleRoot() ?? localSourcePath;
      return localSourcePath;
    }

    if (looksLikeLocalPath(this.config.sourceModule)) {
      throw new Error(`source path not found: ${localSourcePath}`);
    }

    return this.installExternalSource();
  }

  installExternalSource() {
    const sourceRoot = path.join(this.config.dir, ".dynamic-source");
    const spec = createNpmSpec(this.config.sourceModule, this.config.sourceVersion);

    console.log(`npm install source ${spec}`);
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.mkdirSync(sourceRoot, { recursive: true, mode: 0o755 });

    const result = runNpm(["install", spec], sourceRoot);
    if (result.error || result.status !== 0) {
      throw new Error(`npm install source failed: ${result.error?.message ?? result.status}`);
    }

    const moduleRoot = findInstalledPackageRoot(sourceRoot, this.config.sourceModule);
    this.sourceModuleRoot = moduleRoot;
    const packagePath = this.config.sourcePackage === "."
      ? moduleRoot
      : path.join(moduleRoot, this.config.sourcePackage);
    if (!fs.existsSync(packagePath)) {
      throw new Error(`source package path not found after install: ${packagePath}`);
    }
    return packagePath;
  }

  async validateTunnel() {
    const entry = await this.resolveEntry();
    console.log(`validate tunnel ${entry.absolute}`);
    await validateTunnelEntry(entry.absolute);
  }

  async createMeta() {
    const version = await resolveSourceVersion(this.sourceModuleRoot);
    return createBuildMeta(this.config, { version });
  }

  resolveLocalSourceModuleRoot() {
    const moduleName = this.config.sourceModule || "";
    if (moduleName.startsWith("file:")) {
      try {
        const cwd = process.cwd().endsWith(path.sep) ? process.cwd() : `${process.cwd()}${path.sep}`;
        return fileURLToPath(new URL(moduleName, pathToFileURL(cwd)));
      } catch {
        return null;
      }
    }
    if (path.isAbsolute(moduleName)) {
      return moduleName;
    }

    const candidate = path.join(process.cwd(), moduleName);
    return fs.existsSync(candidate) ? candidate : null;
  }

  async createBundleZip(zipPath, meta) {
    const bundlePath = path.join(this.config.dir, "bundle.js");
    const appBundlePath = path.join(this.config.dir, "dynamic-node-app.cjs");
    await writeZip(zipPath, (zipfile) => {
      zipfile.addFile(bundlePath, "bundle.js");
      zipfile.addFile(appBundlePath, "dynamic-node-app.cjs");
      zipfile.addBuffer(Buffer.from(JSON.stringify({ type: "commonjs" }, null, 2) + "\n"), "package.json");
      zipfile.addBuffer(Buffer.from(stringifyMeta(meta)), META_FILE);
    });
  }

  async createFullZip(zipPath, srcDir, meta) {
    const entry = await this.resolveEntry();
    const packageInfo = await readPackageInfo(srcDir);
    const entryFile = "dynamic-node-entry.cjs";
    const appRequire = `./${toZipPath(entry.relative)}`;
    const packageJson = {
      ...packageInfo.packageJson,
      main: entryFile,
    };

    await writeZip(zipPath, async (zipfile) => {
      await addDirectoryToZip(zipfile, srcDir, srcDir);
      zipfile.addBuffer(Buffer.from(createCjsWrapper(appRequire, meta)), entryFile);
      zipfile.addBuffer(Buffer.from(JSON.stringify(packageJson, null, 2) + "\n"), "package.json");
      zipfile.addBuffer(Buffer.from(stringifyMeta(meta)), META_FILE);
    });
  }

  async stageFullDirectory(srcDir, meta) {
    const entry = await this.resolveEntry();
    await copyDirectory(srcDir, this.config.dir);
    const packageInfo = await readPackageInfo(srcDir);
    const entryFile = "dynamic-node-entry.cjs";
    const packageJson = {
      ...packageInfo.packageJson,
      main: entryFile,
    };

    await fs.promises.writeFile(
      path.join(this.config.dir, entryFile),
      createCjsWrapper(`./${toZipPath(entry.relative)}`, meta),
      "utf8",
    );
    await fs.promises.writeFile(
      path.join(this.config.dir, "package.json"),
      JSON.stringify(packageJson, null, 2) + "\n",
      "utf8",
    );
    await fs.promises.writeFile(
      path.join(this.config.dir, META_FILE),
      stringifyMeta(meta),
      "utf8",
    );
  }

  async writeNetrcFromEnv() {
    const netrc = getNetrcFromEnv();
    if (!netrc.trim()) {
      return;
    }

    const netrcPath = path.join(os.homedir(), process.platform === "win32" ? "_netrc" : ".netrc");
    let original = null;
    let existed = false;
    try {
      original = await fs.promises.readFile(netrcPath);
      existed = true;
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    console.log(`write ${netrcPath}`);
    await fs.promises.writeFile(netrcPath, netrc, { mode: 0o600 });
    this.netrcState = { netrcPath, original, existed };
  }

  async restoreNetrc() {
    if (!this.netrcState) {
      return;
    }

    const { netrcPath, original, existed } = this.netrcState;
    console.log(`restore ${netrcPath}`);
    if (existed) {
      await fs.promises.writeFile(netrcPath, original, { mode: 0o600 });
    } else {
      await fs.promises.rm(netrcPath, { force: true });
    }
    this.netrcState = null;
  }

  async resolveEntry() {
    if (!this.entry) {
      this.entry = await resolveEntryPath(this.resolveSourcePath(), {
        entry: this.config.entry,
      });
    }
    return this.entry;
  }
}

async function writeZip(zipPath, addEntries) {
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true, mode: 0o755 });

  const zipfile = new yazl.ZipFile();
  await addEntries(zipfile);

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    out.on("close", resolve);
    out.on("error", reject);
    zipfile.outputStream.on("error", reject);
    zipfile.outputStream.pipe(out);
    zipfile.end();
  });
}

async function addDirectoryToZip(zipfile, rootDir, currentDir) {
  const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    const rel = toZipPath(path.relative(rootDir, fullPath));
    if (rel === META_FILE || rel === "package.json" || rel === "dynamic-node-entry.cjs") {
      continue;
    }

    if (entry.isSymbolicLink()) {
      const stat = await fs.promises.stat(fullPath);
      if (stat.isDirectory()) {
        zipfile.addEmptyDirectory(`${rel}/`);
        await addDirectoryToZip(zipfile, rootDir, fullPath);
        continue;
      }

      zipfile.addFile(fullPath, rel);
      continue;
    }

    if (entry.isDirectory()) {
      zipfile.addEmptyDirectory(`${rel}/`);
      await addDirectoryToZip(zipfile, rootDir, fullPath);
      continue;
    }

    zipfile.addFile(fullPath, rel);
  }
}

function toZipPath(value) {
  return value.split(path.sep).join("/");
}

function timestampSuffix() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
}

async function copyDirectory(srcDir, destDir) {
  const srcRoot = path.resolve(srcDir);
  const destRoot = path.resolve(destDir);
  if (destRoot === srcRoot || destRoot.startsWith(srcRoot + path.sep)) {
    throw new Error(`full build output directory must not be inside source directory: ${destDir}`);
  }

  await fs.promises.mkdir(destDir, { recursive: true, mode: 0o755 });
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }

    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      const stat = await fs.promises.stat(src);
      if (stat.isDirectory()) {
        await copyDirectory(src, dest);
        continue;
      }
      await fs.promises.copyFile(src, dest);
      continue;
    }
    if (entry.isDirectory()) {
      await copyDirectory(src, dest);
      continue;
    }
    await fs.promises.copyFile(src, dest);
  }
}

async function readPackageInfo(srcDir) {
  const packageJsonPath = path.join(srcDir, "package.json");
  if (!(await exists(packageJsonPath))) {
    return { packageJson: { type: "commonjs" } };
  }

  const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
  return {
    packageJson,
  };
}

async function resolveSourceVersion(moduleRoot) {
  if (!moduleRoot) {
    return "unknown";
  }

  // Match the Go builder's ownership model: dynamic.version belongs to the
  // source module resolved by the builder, not to a package-level Tunnel meta.
  const packageJsonPath = path.join(moduleRoot, "package.json");
  if (!(await exists(packageJsonPath))) {
    return "unknown";
  }

  const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
  return typeof packageJson.version === "string" && packageJson.version.trim()
    ? packageJson.version
    : "unknown";
}

function createCjsWrapper(appRequire, meta) {
  return `"use strict";

const app = require(${JSON.stringify(appRequire)});
const dynamicMeta = ${JSON.stringify(meta, null, 2)};

function metaString() {
  return JSON.stringify(dynamicMeta, null, 2);
}

function pick(value, lower, upper) {
  if (value && typeof value[lower] === "function") return value[lower].bind(value);
  if (value && typeof value[upper] === "function") return value[upper].bind(value);
  return null;
}

function wrapTunnel(value) {
  const init = pick(value, "init", "Init");
  const invoke = pick(value, "invoke", "Invoke");
  const close = pick(value, "close", "Close");
  if (!init || !invoke || !close) {
    throw new TypeError("dynamic-node wrapper: target is not a Tunnel");
  }

  return {
    init,
    invoke,
    meta() {
      return dynamicMeta;
    },
    close,
    Init() {
      return init();
    },
    Invoke(route, request) {
      return invoke(route, request);
    },
    Meta() {
      return metaString();
    },
    Close() {
      return close();
    },
  };
}

function hasObject(value) {
  return value && (typeof value === "object" || typeof value === "function");
}

function getFactory() {
  if (typeof app.New === "function") return app.New.bind(app);
  if (typeof app.default === "function") return app.default;
  if (typeof app.default?.New === "function") return app.default.New.bind(app.default);
  return null;
}

function getTunnel() {
  if (hasObject(app.Tunnel)) return app.Tunnel;
  if (hasObject(app.default?.Tunnel)) return app.default.Tunnel;
  if (hasObject(app.default) && !getFactory()) return app.default;
  if (hasObject(app) && !getFactory()) return app;
  return null;
}

const sourceTunnel = getTunnel();
const sourceFactory = getFactory();

if (sourceTunnel) {
  module.exports.Tunnel = wrapTunnel(sourceTunnel);
}

if (sourceFactory) {
  module.exports.New = async (...args) => wrapTunnel(await sourceFactory(...args));
}

if (!module.exports.Tunnel && !module.exports.New) {
  throw new TypeError("dynamic-node wrapper: module does not export Tunnel, New, or default");
}

module.exports.default = module.exports.Tunnel || { New: module.exports.New };
`;
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

function looksLikeLocalPath(value) {
  return (
    value.startsWith(".") ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("file:")
  );
}

function createNpmSpec(moduleName, version) {
  if (looksLikeHostPath(moduleName)) {
    const gitUrl = `git+https://${moduleName}.git`;
    if (!version || version === "latest") {
      return gitUrl;
    }
    return `${gitUrl}#${version}`;
  }
  if (!version || version === "latest") {
    return moduleName;
  }
  if (
    moduleName.includes("://") ||
    moduleName.startsWith("git+") ||
    moduleName.endsWith(".git")
  ) {
    return `${moduleName}#${version}`;
  }
  return `${moduleName}@${version}`;
}

function looksLikeHostPath(moduleName) {
  if (!moduleName) {
    return false;
  }
  if (
    moduleName.includes("://") ||
    moduleName.startsWith("git+") ||
    moduleName.endsWith(".git") ||
    moduleName.startsWith("@") ||
    looksLikeLocalPath(moduleName)
  ) {
    return false;
  }
  const slashIdx = moduleName.indexOf("/");
  if (slashIdx <= 0) {
    return false;
  }
  const host = moduleName.slice(0, slashIdx);
  return host.includes(".") && !/\s/.test(host);
}

function findInstalledPackageRoot(sourceRoot, moduleName) {
  const nodeModules = path.join(sourceRoot, "node_modules");
  const normalized = moduleName.replace(/^npm:/, "");
  if (normalized.startsWith("@")) {
    const parts = normalized.split("/");
    const scoped = path.join(nodeModules, parts[0], parts[1] ?? "");
    if (fs.existsSync(scoped)) {
      return scoped;
    }
  } else {
    const first = normalized.split("/", 1)[0];
    const plain = path.join(nodeModules, first);
    if (fs.existsSync(plain)) {
      return plain;
    }
  }

  const installedFromGenerated = findInstalledFromGeneratedPackageJson(sourceRoot, nodeModules);
  if (installedFromGenerated) {
    return installedFromGenerated;
  }

  const entries = fs.readdirSync(nodeModules, { withFileTypes: true });
  const packages = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin") {
      continue;
    }
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModules, entry.name);
      for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (scoped.isDirectory()) {
          packages.push(path.join(scopeDir, scoped.name));
        }
      }
      continue;
    }
    packages.push(path.join(nodeModules, entry.name));
  }

  if (packages.length === 1) {
    return packages[0];
  }
  throw new Error(`cannot determine installed source package root for ${moduleName}`);
}

function findInstalledFromGeneratedPackageJson(sourceRoot, nodeModules) {
  const generatedPath = path.join(sourceRoot, "package.json");
  if (!fs.existsSync(generatedPath)) {
    return null;
  }
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
  } catch {
    return null;
  }
  const names = Object.keys(pkg?.dependencies ?? {});
  if (names.length !== 1) {
    return null;
  }
  const installedName = names[0];
  const installedPath = installedName.startsWith("@")
    ? path.join(nodeModules, ...installedName.split("/"))
    : path.join(nodeModules, installedName);
  return fs.existsSync(installedPath) ? installedPath : null;
}

function getNetrcFromEnv() {
  for (const name of ["DYNAMIC_NETRC", "DynamicNetrc", "GIT_NETRC", "GitNetrc", "NPM_NETRC"]) {
    const value = process.env[name];
    if (value?.trim()) {
      return value;
    }
  }
  return "";
}

function runNpm(args, cwd) {
  const finalArgs = withNpmDefaults(args);
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm", ...finalArgs], {
      cwd,
      stdio: "inherit",
      shell: false,
      env,
    });
  }

  return spawnSync("npm", finalArgs, {
    cwd,
    stdio: "inherit",
    shell: false,
    env,
  });
}

function withNpmDefaults(args) {
  const additions = [];
  if (!args.some((a) => a === "--loglevel" || a.startsWith("--loglevel="))) {
    additions.push("--loglevel=http");
  }
  if (!args.includes("--no-audit")) {
    additions.push("--no-audit");
  }
  if (!args.includes("--no-fund")) {
    additions.push("--no-fund");
  }
  return [...args, ...additions];
}
