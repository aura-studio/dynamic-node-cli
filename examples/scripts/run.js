import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assert,
  cleanupRemote,
  cli,
  cliOutput,
  createContext,
  ensureBuilt,
  ensureConfig,
  ensureDependencies,
  findBundleZip,
  findFullZip,
  hasZipArtifact,
  listArtifacts,
  listRemoteKeys,
  removePath,
  run,
  runNpm,
  startDockerS3,
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
  cli(ctx, ["toolchain", "check", "-c", ctx.configPath, "-p", "sample-bundle"]);
  cli(ctx, ["toolchain", "check", "-c", ctx.configPath, "-p", "sample-full"]);
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
  assert(findBundleZip(ctx), "bundle zip was not created");
  assert(findFullZip(ctx), "full zip was not created");
  console.log("build all test passed");
}

async function stepPush(ctx) {
  ensureBuilt(ctx);
  assert(
    ctx.remoteWasExplicit || ctx.env.AWS_ENDPOINT_URL || ctx.env.AWS_ENDPOINT_URL_S3,
    "set DYNAMIC_NODE_TEST_REMOTE for real S3, or use 99-run-all-docker-s3",
  );
  cli(ctx, ["push", "-c", ctx.configPath]);
  const keys = await listRemoteKeys(ctx);
  assert(keys.some((key) => key.endsWith(`libnode_test_bundle_${ctx.testId}.zip`)), "remote bundle zip missing");
  assert(keys.some((key) => key.endsWith(`libnode_test_full_${ctx.testId}.zip`)), "remote full zip missing");
  for (const key of keys) {
    console.log(key);
  }
  console.log("push test passed");
}

async function stepPull(ctx) {
  ensureConfig(ctx);
  removePath(ctx.warehouseDir);
  cli(ctx, ["pull", "-c", ctx.configPath, "--force"]);
  assert(findBundleZip(ctx), "bundle zip was not pulled");
  assert(findFullZip(ctx), "full zip was not pulled");
  listArtifacts(ctx);
  console.log("pull test passed");
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
  const script = path.join(ctx.repoRoot, "scripts", "install-from-github.sh");
  assert(fs.existsSync(script), "install-from-github.sh not found");
  if (process.platform === "win32") {
    console.log("github install script is bash-only; skipped on Windows");
    return;
  }
  run("bash", [script], { cwd: ctx.repoRoot, env: ctx.env });
  cli(ctx, ["version"]);
  console.log("github install test passed");
}

async function stepCleanS3(ctx) {
  await cleanupRemote(ctx);
  console.log("s3 cleanup test passed");
}

async function stepMeta(ctx) {
  ensureBuilt(ctx);
  const bundleZip = findBundleZip(ctx);
  const fullZip = findFullZip(ctx);
  assert(bundleZip, "bundle zip is required");
  assert(fullZip, "full zip is required");
  assert(cliOutput(ctx, ["meta", "read", bundleZip]).includes("variant: bundle"), "bundle meta read failed");
  assert(cliOutput(ctx, ["meta", "call", bundleZip]).includes("variant: bundle"), "bundle meta call failed");
  assert(cliOutput(ctx, ["meta", "read", fullZip]).includes("variant: full"), "full meta read failed");
  assert(cliOutput(ctx, ["meta", "call", fullZip]).includes("variant: full"), "full meta call failed");
  assert(cliOutput(ctx, ["meta", "nm", bundleZip]).includes("dynamic-meta.json"), "meta nm failed");
  assert(cliOutput(ctx, ["meta", "objdump", fullZip]).includes("dynamic-node-entry.cjs"), "meta objdump failed");
  console.log("meta test passed");
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
