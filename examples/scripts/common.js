import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractZip } from "../../src/meta/zip.js";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.dirname(SCRIPT_DIR);
const REPO_ROOT = path.dirname(EXAMPLES_DIR);
const requireBuilt = createRequire(import.meta.url);
const extractedArtifacts = [];

process.once("exit", () => {
  for (const dir of extractedArtifacts) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

export const TARGET_PACKAGES = [
  "bundle",
  "full",
  "service-bundle",
  "service-full",
  "wire-bundle",
  "wire-full",
];

export function createContext(env = process.env) {
  const testId = env.DYNAMIC_NODE_TEST_ID || "manual";
  const npmCache = env.DYNAMIC_NODE_TEST_NPM_CACHE || path.join(EXAMPLES_DIR, ".npm-cache");
  const childEnv = { ...env };
  for (const key of Object.keys(childEnv)) {
    if (key.toLowerCase() === "npm_config_cache") {
      delete childEnv[key];
    }
  }
  return {
    env: {
      ...childEnv,
      npm_config_cache: npmCache,
      NPM_CONFIG_CACHE: npmCache,
    },
    scriptDir: SCRIPT_DIR,
    examplesDir: EXAMPLES_DIR,
    repoRoot: REPO_ROOT,
    appDir: env.DYNAMIC_NODE_TEST_APP || path.join(EXAMPLES_DIR, "sample-app"),
    warehouseDir: env.DYNAMIC_NODE_TEST_WAREHOUSE || path.join(EXAMPLES_DIR, "warehouse"),
    configPath: env.DYNAMIC_NODE_TEST_CONFIG || path.join(EXAMPLES_DIR, "dynamic-node-cli.yaml"),
    testId,
    remote: env.DYNAMIC_NODE_TEST_REMOTE || `s3://dynamic-node-cli-test/${testId}`,
    remoteWasExplicit: Boolean(env.DYNAMIC_NODE_TEST_REMOTE),
  };
}

export function ensureDependencies(ctx) {
  if (fs.existsSync(path.join(ctx.repoRoot, "node_modules"))) {
    return;
  }
  runNpm(["install"], { cwd: ctx.repoRoot, env: ctx.env });
}

export function cli(ctx, args, options = {}) {
  return run(process.execPath, [path.join(ctx.repoRoot, "src/main.js"), ...args], {
    cwd: ctx.repoRoot,
    env: ctx.env,
    ...options,
  });
}

export function cliOutput(ctx, args) {
  return run(process.execPath, [path.join(ctx.repoRoot, "src/main.js"), ...args], {
    cwd: ctx.repoRoot,
    env: ctx.env,
    encoding: "utf8",
  }).stdout.trim();
}

export function runNpm(args, options = {}) {
  if (process.platform === "win32") {
    return run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm", ...args], options);
  }
  return run("npm", args, options);
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.encoding ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.encoding,
    shell: false,
  });
  if (result.error || result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    throw new Error(
      `command failed: ${command} ${args.join(" ")} (${result.error?.message ?? result.status})${stderr}`,
    );
  }
  return result;
}

export function writeConfig(ctx) {
  ensureDependencies(ctx);
  const osValue = cliOutput(ctx, ["toolchain", "describe", "os"]);
  const archValue = cliOutput(ctx, ["toolchain", "describe", "arch"]);
  const compilerValue = cliOutput(ctx, ["toolchain", "describe", "compiler"]);
  const warehouse = toPosix(ctx.warehouseDir);
  const examples = toPosix(ctx.examplesDir);
  const remote = ctx.remote;

  const content = `environments:
  - name: bundle-env
    toolchain:
      os: ${osValue}
      arch: ${archValue}
      compiler: ${compilerValue}
      variant: bundle
    warehouse:
      local: ${warehouse}
      remote:
        - ${remote}
  - name: full-env
    toolchain:
      os: ${osValue}
      arch: ${archValue}
      compiler: ${compilerValue}
      variant: full
    warehouse:
      local: ${warehouse}
      remote:
        - ${remote}

procedures:
  - name: sample-bundle
    environment: bundle-env
    source:
      module: ${examples}
      package: sample-app
      version: latest
    target:
      namespace: test
      package: bundle
      version: ${ctx.testId}
  - name: sample-full
    environment: full-env
    source:
      module: ${examples}
      package: sample-app
      version: latest
    target:
      namespace: test
      package: full
      version: ${ctx.testId}
  - name: service-bundle
    environment: bundle-env
    source:
      module: ${examples}
      package: service-app
      version: latest
    target:
      namespace: test
      package: service-bundle
      version: ${ctx.testId}
  - name: service-full
    environment: full-env
    source:
      module: ${examples}
      package: service-app
      version: latest
    target:
      namespace: test
      package: service-full
      version: ${ctx.testId}
  - name: wire-bundle
    environment: bundle-env
    source:
      module: ${examples}
      package: wire-app
      version: latest
    target:
      namespace: test
      package: wire-bundle
      version: ${ctx.testId}
  - name: wire-full
    environment: full-env
    source:
      module: ${examples}
      package: wire-app
      version: latest
    target:
      namespace: test
      package: wire-full
      version: ${ctx.testId}
`;

  fs.mkdirSync(path.dirname(ctx.configPath), { recursive: true });
  fs.writeFileSync(ctx.configPath, content);
  printContext(ctx);
  console.log(`created ${ctx.configPath}`);
}

export function ensureConfig(ctx) {
  if (!fs.existsSync(ctx.configPath)) {
    writeConfig(ctx);
  }
}

export function ensureBuilt(ctx) {
  ensureConfig(ctx);
  if (!hasAllTargetZips(ctx)) {
    cli(ctx, ["build", "-c", ctx.configPath]);
  }
}

export function hasZipArtifact(ctx) {
  return findArtifacts(ctx, "libnode_test_*.zip").length > 0;
}

export function hasAllTargetZips(ctx) {
  return TARGET_PACKAGES.every((targetPackage) => Boolean(findTargetZip(ctx, targetPackage)));
}

export function findBundleZip(ctx) {
  return findFirst(ctx, `libnode_test_bundle_${ctx.testId}.zip`);
}

export function findFullZip(ctx) {
  return findFirst(ctx, `libnode_test_full_${ctx.testId}.zip`);
}

export function findTargetZip(ctx, targetPackage) {
  return findFirst(ctx, `libnode_test_${targetPackage}_${ctx.testId}.zip`);
}

export function assertAllTargetZips(ctx) {
  for (const targetPackage of TARGET_PACKAGES) {
    assert(findTargetZip(ctx, targetPackage), `${targetPackage} zip was not created`);
  }
}

export async function loadBuiltTunnel(ctx, targetPackage) {
  const zipPath = findTargetZip(ctx, targetPackage);
  assert(zipPath, `${targetPackage} zip is required`);

  const dir = path.dirname(zipPath);
  const entry = await resolveArtifactEntry(zipPath, dir, targetPackage);
  const mod = requireBuilt(entry);
  if (isObject(mod.Tunnel)) return mod.Tunnel;
  if (typeof mod.New === "function") return await mod.New();
  if (isObject(mod.default?.Tunnel)) return mod.default.Tunnel;
  if (typeof mod.default?.New === "function") return await mod.default.New();
  if (isObject(mod.default)) return mod.default;
  throw new Error(`${targetPackage} artifact does not export Tunnel or New`);
}

async function resolveArtifactEntry(zipPath, dir, targetPackage) {
  const stagedEntry = findLoadableEntry(dir);
  if (stagedEntry) {
    return stagedEntry;
  }

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `dynamic-node-cli-${targetPackage}-`));
  extractedArtifacts.push(tmpDir);
  await extractZip(zipPath, tmpDir);
  return findLoadableEntry(tmpDir) || tmpDir;
}

function findLoadableEntry(dir) {
  if (fs.existsSync(path.join(dir, "bundle.js"))) {
    return path.join(dir, "bundle.js");
  }
  if (fs.existsSync(path.join(dir, "package.json"))) {
    return dir;
  }
  return "";
}

export function findArtifacts(ctx, pattern) {
  if (!fs.existsSync(ctx.warehouseDir)) {
    return [];
  }
  const matcher = globToRegExp(pattern);
  const matches = [];
  walk(ctx.warehouseDir, (filePath) => {
    if (matcher.test(path.basename(filePath))) {
      matches.push(filePath);
    }
  });
  return matches.sort();
}

export function listArtifacts(ctx) {
  if (!fs.existsSync(ctx.warehouseDir)) {
    return;
  }
  const files = [];
  walk(ctx.warehouseDir, (filePath) => files.push(filePath));
  for (const file of files.sort()) {
    console.log(file);
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

export function printContext(ctx) {
  console.log(`REPO_ROOT=${ctx.repoRoot}`);
  console.log(`APP_DIR=${ctx.appDir}`);
  console.log(`WAREHOUSE_DIR=${ctx.warehouseDir}`);
  console.log(`CONFIG_PATH=${ctx.configPath}`);
  console.log(`TEST_ID=${ctx.testId}`);
  console.log(`REMOTE=${ctx.remote}`);
  if (ctx.env.AWS_ENDPOINT_URL || ctx.env.AWS_ENDPOINT_URL_S3) {
    console.log(`AWS_ENDPOINT_URL=${ctx.env.AWS_ENDPOINT_URL || ctx.env.AWS_ENDPOINT_URL_S3}`);
  }
}

export async function createBucket(ctx) {
  const parsed = parseS3Uri(ctx.remote);
  const client = createS3Client(ctx);
  await client.send(new CreateBucketCommand({ Bucket: parsed.bucket })).catch((err) => {
    if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(err.name)) {
      throw err;
    }
  });
}

export async function listRemoteKeys(ctx) {
  const parsed = parseS3Uri(ctx.remote);
  const client = createS3Client(ctx);
  const keys = [];
  let ContinuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: parsed.bucket,
        Prefix: parsed.prefix,
        ContinuationToken,
      }),
    );
    for (const item of page.Contents || []) {
      if (item.Key) {
        keys.push(item.Key);
      }
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

export async function cleanupRemote(ctx, { deleteBucket = false } = {}) {
  const parsed = parseS3Uri(ctx.remote);
  const client = createS3Client(ctx);

  for (;;) {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: parsed.bucket,
        Prefix: parsed.prefix,
      }),
    );
    const objects = (page.Contents || [])
      .filter((item) => item.Key)
      .map((item) => ({ Key: item.Key }));
    if (objects.length === 0) {
      break;
    }
    await client.send(
      new DeleteObjectsCommand({
        Bucket: parsed.bucket,
        Delete: { Objects: objects, Quiet: true },
      }),
    );
  }

  if (deleteBucket) {
    await client.send(new DeleteBucketCommand({ Bucket: parsed.bucket })).catch((err) => {
      if (err.name !== "NoSuchBucket") {
        throw err;
      }
    });
  }
}

export async function startDockerS3(ctx) {
  const port = await getFreePort();
  const container = `dynamic-node-cli-s3-${sanitizeDockerName(ctx.testId)}`;
  const image = ctx.env.DYNAMIC_NODE_TEST_S3_IMAGE || "minio/minio:latest";
  const accessKey = ctx.env.AWS_ACCESS_KEY_ID || "minioadmin";
  const secretKey = ctx.env.AWS_SECRET_ACCESS_KEY || "minioadmin";

  try {
    run("docker", ["rm", "-f", container], {
      cwd: ctx.repoRoot,
      env: ctx.env,
      encoding: "utf8",
    });
  } catch {
    // The container usually does not exist before the first run.
  }

  run(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      container,
      "-e",
      `MINIO_ROOT_USER=${accessKey}`,
      "-e",
      `MINIO_ROOT_PASSWORD=${secretKey}`,
      "-p",
      `127.0.0.1:${port}:9000`,
      image,
      "server",
      "/data",
      "--console-address",
      ":9001",
    ],
    { cwd: ctx.repoRoot, env: ctx.env },
  );

  const endpoint = `http://127.0.0.1:${port}`;
  await waitForHttp(`${endpoint}/minio/health/ready`);

  const dockerEnv = {
    ...ctx.env,
    AWS_ACCESS_KEY_ID: accessKey,
    AWS_SECRET_ACCESS_KEY: secretKey,
    AWS_REGION: "us-east-1",
    AWS_ENDPOINT_URL: endpoint,
    AWS_S3_FORCE_PATH_STYLE: "true",
    DYNAMIC_NODE_TEST_REMOTE: `s3://dynamic-node-cli-test/${ctx.testId}`,
  };
  const dockerCtx = createContext(dockerEnv);
  await createBucket(dockerCtx);

  return {
    ctx: dockerCtx,
    endpoint,
    container,
    stop() {
      run("docker", ["stop", container], {
        cwd: ctx.repoRoot,
        env: ctx.env,
        encoding: "utf8",
      });
    },
  };
}

function createS3Client(ctx) {
  const endpoint = ctx.env.AWS_ENDPOINT_URL_S3 || ctx.env.AWS_ENDPOINT_URL || "";
  return new S3Client({
    region: ctx.env.AWS_REGION || "us-east-1",
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: ctx.env.AWS_ACCESS_KEY_ID && ctx.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: ctx.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: ctx.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
}

function parseS3Uri(value) {
  const url = new URL(value.includes("://") ? value : `s3://${value}`);
  const bucket = url.hostname;
  const rawPrefix = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const prefix = rawPrefix ? `${rawPrefix}/` : "";
  return { bucket, prefix };
}

function findFirst(ctx, name) {
  const matches = findArtifacts(ctx, name);
  return matches[0] || "";
}

function isObject(value) {
  return Boolean(value && (typeof value === "object" || typeof value === "function"));
}

function walk(root, visit) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(current, visit);
      continue;
    }
    visit(current);
  }
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function sanitizeDockerName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "manual";
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`S3 container did not become ready: ${lastError?.message || "timeout"}`);
}
