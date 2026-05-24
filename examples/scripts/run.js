import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assert,
  assertAllTargetZips,
  cleanupRemote,
  cli,
  cliOutput,
  createContext,
  ensureBuilt,
  ensureConfig,
  ensureDependencies,
  findBundleZip,
  findFullZip,
  findTargetZip,
  hasZipArtifact,
  listArtifacts,
  listRemoteKeys,
  loadBuiltTunnel,
  removePath,
  run,
  runNpm,
  startDockerS3,
  TARGET_PACKAGES,
  writeConfig,
} from "./common.js";

const steps = new Map([
  ["00-create-config", stepCreateConfig],
  ["01-smoke", stepSmoke],
  ["02-toolchain-check", stepToolchainCheck],
  ["03-build-bundle", stepBuildBundle],
  ["04-build-full", stepBuildFull],
  ["05-build-all", stepBuildAll],
  ["06-push", stepPush],
  ["07-pull", stepPull],
  ["08-clean-cache", stepCleanCache],
  ["09-clean-useless", stepCleanUseless],
  ["10-clean-package", stepCleanPackage],
  ["11-clean-all", stepCleanAll],
  ["12-install-from-github", stepInstallFromGithub],
  ["13-clean-s3", stepCleanS3],
  ["14-meta", stepMeta],
  ["15-service", stepServiceTargets],
  ["16-wire", stepWireTargets],
  ["99-run-all-local", runAllLocal],
  ["99-run-all-with-s3", runAllWithS3],
  ["99-run-all-docker-s3", runAllWithDockerS3],
]);

export async function runStep(name, env = process.env) {
  const step = steps.get(name);
  if (!step) {
    throw new Error(`unknown example step: ${name}`);
  }
  const ctx = createContext(env);
  await step(ctx);
}

export async function main(defaultStep) {
  const step = process.argv[2] || defaultStep;
  try {
    await runStep(step);
  } catch (err) {
    console.error("error:", err?.message || err);
    process.exitCode = 1;
  }
}

async function stepCreateConfig(ctx) {
  writeConfig(ctx);
}

async function stepSmoke(ctx) {
  ensureDependencies(ctx);
  runNpm(["run", "check"], { cwd: ctx.repoRoot, env: ctx.env });
  cli(ctx, ["--help"]);
  cli(ctx, ["version"]);
  cli(ctx, ["toolchain", "describe", "all"]);
  const script = cliOutput(ctx, ["toolchain", "script"]);
  assert(script.includes("DYNAMIC_COMPILER"), "toolchain script should export DYNAMIC_COMPILER");
  console.log("smoke test passed");
}

async function stepToolchainCheck(ctx) {
  ensureConfig(ctx);
  for (const name of [
    "sample-bundle",
    "sample-full",
    "servicebundle",
    "servicefull",
    "wirebundle",
    "wirefull",
  ]) {
    cli(ctx, ["toolchain", "check", "-c", ctx.configPath, "-p", name]);
  }
  console.log("toolchain check passed");
}

async function stepBuildBundle(ctx) {
  ensureConfig(ctx);
  cli(ctx, ["build", "-c", ctx.configPath, "-p", "sample-bundle"]);
  listArtifacts(ctx);
  assert(findBundleZip(ctx), "bundle zip was not created");
  console.log("bundle build test passed");
}

async function stepBuildFull(ctx) {
  ensureConfig(ctx);
  cli(ctx, ["build", "-c", ctx.configPath, "-p", "sample-full"]);
  listArtifacts(ctx);
  assert(findFullZip(ctx), "full zip was not created");
  console.log("full build test passed");
}

async function stepBuildAll(ctx) {
  ensureConfig(ctx);
  cli(ctx, ["build", "-c", ctx.configPath]);
  listArtifacts(ctx);
  assertAllTargetZips(ctx);
  console.log("build all test passed");
}

async function stepPush(ctx) {
  ensureBuilt(ctx);
  const hasS3Config = ctx.remoteWasExplicit || ctx.env.AWS_ENDPOINT_URL || ctx.env.AWS_ENDPOINT_URL_S3;
  let docker = null;
  let runCtx = ctx;
  if (!hasS3Config) {
    docker = await startDockerS3(ctx);
    runCtx = docker.ctx;
    console.log(`docker s3 endpoint: ${docker.endpoint}`);
  }
  try {
    cli(runCtx, ["push", "-c", runCtx.configPath]);
    const keys = await listRemoteKeys(runCtx);
    for (const targetPackage of TARGET_PACKAGES) {
      assert(
        keys.some((key) => key.endsWith(`libnode_test_${targetPackage}_${runCtx.testId}.zip`)),
        `remote ${targetPackage} zip missing`,
      );
    }
    for (const key of keys) {
      console.log(key);
    }
    console.log("push test passed");
  } finally {
    if (docker && ctx.env.DYNAMIC_NODE_TEST_KEEP_DOCKER !== "1") {
      try { docker.stop(); } catch (err) { console.error(`warning: docker stop failed: ${err.message}`); }
    }
  }
}

async function stepPull(ctx) {
  const hasS3Config = ctx.remoteWasExplicit || ctx.env.AWS_ENDPOINT_URL || ctx.env.AWS_ENDPOINT_URL_S3;
  let docker = null;
  let runCtx = ctx;
  if (!hasS3Config) {
    ensureBuilt(ctx);
    docker = await startDockerS3(ctx);
    runCtx = docker.ctx;
    console.log(`docker s3 endpoint: ${docker.endpoint}`);
    cli(runCtx, ["push", "-c", runCtx.configPath]);
  } else {
    ensureConfig(ctx);
  }
  try {
    removePath(runCtx.warehouseDir);
    cli(runCtx, ["pull", "-c", runCtx.configPath, "--force"]);
    assertAllTargetZips(runCtx);
    listArtifacts(runCtx);
    console.log("pull test passed");
  } finally {
    if (docker && ctx.env.DYNAMIC_NODE_TEST_KEEP_DOCKER !== "1") {
      try { docker.stop(); } catch (err) { console.error(`warning: docker stop failed: ${err.message}`); }
    }
  }
}

async function stepCleanCache(ctx) {
  ensureBuilt(ctx);
  const cacheFile = path.join(ctx.warehouseDir, "cache-check", "cache.tmp");
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, "cache");
  cli(ctx, ["clean", "cache", "-c", ctx.configPath]);
  assert(!fs.existsSync(cacheFile), "cache file should be removed");
  assert(findBundleZip(ctx), "bundle zip should be kept");
  console.log("clean cache test passed");
}

async function stepCleanUseless(ctx) {
  ensureBuilt(ctx);
  const bundleZip = findBundleZip(ctx);
  assert(bundleZip, "bundle zip is required");
  const backupZip = `${bundleZip}.manual-backup`;
  fs.copyFileSync(bundleZip, backupZip);
  cli(ctx, ["clean", "useless", "-c", ctx.configPath]);
  assert(!fs.existsSync(backupZip), "timestamp/manual backup should be removed");
  assert(fs.existsSync(bundleZip), "primary bundle zip should be kept");
  console.log("clean useless test passed");
}

async function stepCleanPackage(ctx) {
  ensureBuilt(ctx);
  cli(ctx, ["clean", "package", "-c", ctx.configPath]);
  assert(!hasZipArtifact(ctx), "zip artifacts should be removed");
  console.log("clean package test passed");
}

async function stepCleanAll(ctx) {
  ensureConfig(ctx);
  if (!hasZipArtifact(ctx)) {
    cli(ctx, ["build", "-c", ctx.configPath]);
  }
  cli(ctx, ["clean", "all", "-c", ctx.configPath]);
  assert(!fs.existsSync(ctx.warehouseDir) || fs.readdirSync(ctx.warehouseDir).length === 0, "warehouse should be empty");
  console.log("clean all test passed");
}

async function stepInstallFromGithub(ctx) {
  runNpm(["install", "-g", "--force", "github:aura-studio/dynamic-node-cli"], { cwd: ctx.repoRoot, env: ctx.env });
  cli(ctx, ["version"]);
  console.log("github install test passed");
}

async function stepCleanS3(ctx) {
  const hasS3Config = ctx.remoteWasExplicit || ctx.env.AWS_ENDPOINT_URL || ctx.env.AWS_ENDPOINT_URL_S3;
  let docker = null;
  let runCtx = ctx;
  if (!hasS3Config) {
    docker = await startDockerS3(ctx);
    runCtx = docker.ctx;
    console.log(`docker s3 endpoint: ${docker.endpoint}`);
  }
  try {
    await cleanupRemote(runCtx);
    console.log("s3 cleanup test passed");
  } finally {
    if (docker && ctx.env.DYNAMIC_NODE_TEST_KEEP_DOCKER !== "1") {
      try { docker.stop(); } catch (err) { console.error(`warning: docker stop failed: ${err.message}`); }
    }
  }
}

async function stepMeta(ctx) {
  ensureBuilt(ctx);
  for (const targetPackage of TARGET_PACKAGES) {
    const zipPath = findTargetZip(ctx, targetPackage);
    assert(zipPath, `${targetPackage} zip is required`);
    const variant = targetPackage.endsWith("bundle") || targetPackage === "bundle" ? "bundle" : "full";
    const readMeta = JSON.parse(cliOutput(ctx, ["meta", "read", zipPath, "--json"]));
    const callMeta = JSON.parse(cliOutput(ctx, ["meta", "call", zipPath, "--json"]));
    assertDynamicMetaShape(readMeta, variant, `${targetPackage} meta read`);
    assertDynamicMetaShape(callMeta, variant, `${targetPackage} meta call`);
    console.log(`${targetPackage} meta read: ${JSON.stringify(readMeta)}`);
    console.log(`${targetPackage} meta call: ${JSON.stringify(callMeta)}`);
  }

  const bundleZip = findBundleZip(ctx);
  const fullZip = findFullZip(ctx);
  assert(cliOutput(ctx, ["meta", "nm", bundleZip]).includes("dynamic-meta.json"), "meta nm failed");
  assert(cliOutput(ctx, ["meta", "objdump", fullZip]).includes("dynamic-node-entry.cjs"), "meta objdump failed");
  console.log("meta test passed");
}

async function stepServiceTargets(ctx) {
  ensureBuilt(ctx);
  for (const targetPackage of ["servicebundle", "servicefull"]) {
    const tunnel = await loadBuiltTunnel(ctx, targetPackage);
    await callTunnel(tunnel, "init");
    const response = await callTunnel(
      tunnel,
      "invoke",
      "/greet-user",
      encodeEnvelope({ name: targetPackage }),
    );
    const envelope = decodeEnvelope(response);
    assert(envelope.meta.handler === "greetUser", `${targetPackage} service handler meta mismatch`);
    assert(envelope.payload.message === `hello ${targetPackage}`, `${targetPackage} service payload mismatch`);
    assert(envelope.payload.route === "/greet-user", `${targetPackage} service route mismatch`);
    await callTunnel(tunnel, "close");
  }
  console.log("service target tests passed");
}

async function stepWireTargets(ctx) {
  ensureBuilt(ctx);
  for (const targetPackage of ["wirebundle", "wirefull"]) {
    const tunnel = await loadBuiltTunnel(ctx, targetPackage);
    await callTunnel(tunnel, "init");

    const server = http.createServer(async (req, res) => {
      try {
        await callTunnel(tunnel, "invoke", "/wire", { req, res });
      } catch (err) {
        res.statusCode = 500;
        res.end(err && err.stack ? err.stack : String(err));
      }
    });

    try {
      const baseUrl = await listen(server);
      const response = await fetch(`${baseUrl}/hello?case=${encodeURIComponent(targetPackage)}`, {
        headers: { "x-dynamic-node-target": targetPackage },
      });
      const body = await response.json();
      assert(response.status === 200, `${targetPackage} wire status mismatch`);
      assert(body.message === "hello wire-node", `${targetPackage} wire message mismatch`);
      assert(body.method === "GET", `${targetPackage} wire method mismatch`);
      assert(body.target === targetPackage, `${targetPackage} wire header mismatch`);
    } finally {
      await closeServer(server);
      await callTunnel(tunnel, "close");
    }
  }
  console.log("wire target tests passed");
}

async function runAllLocal(ctx) {
  for (const name of [
    "00-create-config",
    "01-smoke",
    "02-toolchain-check",
    "03-build-bundle",
    "04-build-full",
    "05-build-all",
    "14-meta",
    "15-service",
    "16-wire",
    "08-clean-cache",
    "09-clean-useless",
    "10-clean-package",
    "11-clean-all",
  ]) {
    await steps.get(name)(ctx);
  }
  console.log("all local tests passed");
}

async function runAllWithS3(ctx) {
  try {
    for (const name of [
      "00-create-config",
      "01-smoke",
      "02-toolchain-check",
      "05-build-all",
      "06-push",
      "07-pull",
      "14-meta",
      "15-service",
      "16-wire",
      "08-clean-cache",
      "09-clean-useless",
      "10-clean-package",
      "11-clean-all",
    ]) {
      await steps.get(name)(ctx);
    }
    console.log("all tests with s3 passed");
  } finally {
    if (ctx.env.DYNAMIC_NODE_TEST_KEEP_REMOTE !== "1") {
      await cleanupRemote(ctx).catch((err) => {
        console.error(`warning: remote cleanup failed: ${err.message}`);
      });
    }
  }
}

async function runAllWithDockerS3(ctx) {
  const docker = await startDockerS3(ctx);
  try {
    await runAllWithS3(docker.ctx);
    console.log(`docker s3 endpoint: ${docker.endpoint}`);
    console.log("all tests with docker s3 passed");
  } finally {
    if (ctx.env.DYNAMIC_NODE_TEST_KEEP_DOCKER !== "1") {
      try {
        docker.stop();
      } catch (err) {
        console.error(`warning: docker stop failed: ${err.message}`);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main("99-run-all-local");
}

async function callTunnel(tunnel, lower, ...args) {
  const upper = lower[0].toUpperCase() + lower.slice(1);
  const fn = typeof tunnel[lower] === "function" ? tunnel[lower] : tunnel[upper];
  if (typeof fn !== "function") {
    throw new Error(`tunnel does not implement ${lower}/${upper}`);
  }
  return await fn.apply(tunnel, args);
}

function encodeEnvelope(payload, meta = {}) {
  return JSON.stringify({
    meta,
    data: Buffer.from(JSON.stringify(payload)).toString("base64"),
  });
}

function decodeEnvelope(raw) {
  const envelope = JSON.parse(raw || "{}");
  const text = Buffer.from(envelope.data || "", "base64").toString("utf8");
  return {
    meta: envelope.meta || {},
    payload: text ? JSON.parse(text) : null,
  };
}

function assertDynamicMetaShape(meta, variant, label) {
  assert(meta.dynamic && typeof meta.dynamic === "object", `${label} dynamic meta missing`);
  assert(meta.toolchain && typeof meta.toolchain === "object", `${label} toolchain meta missing`);
  assert(Object.keys(meta.dynamic).sort().join(",") === "built,module,version", `${label} dynamic fields mismatch`);
  assert(Object.keys(meta.toolchain).sort().join(",") === "arch,compiler,os,variant", `${label} toolchain fields mismatch`);
  assert(typeof meta.dynamic.module === "string" && meta.dynamic.module, `${label} module missing`);
  assert(typeof meta.dynamic.version === "string" && meta.dynamic.version, `${label} version missing`);
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(meta.dynamic.built), `${label} built format mismatch`);
  assert(meta.toolchain.variant === variant, `${label} variant mismatch`);
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
