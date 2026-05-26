import fs from "node:fs";
import path from "node:path";

export const FALLBACK_ENTRY_FILES = ["tunnel.js", "index.js"];

export async function resolveEntryPath(targetPath, options = {}) {
  const stat = await fs.promises.stat(targetPath);
  if (!stat.isDirectory()) {
    return {
      absolute: path.resolve(targetPath),
      relative: path.basename(targetPath),
    };
  }

  const root = path.resolve(targetPath);
  const explicitEntry = normalizeEntry(options.entry);
  const candidates = [];

  if (explicitEntry) {
    candidates.push({ value: explicitEntry, source: "configured entry" });
  } else {
    const packageMain = await readPackageMain(root);
    if (packageMain) {
      candidates.push({ value: packageMain, source: "package.json main" });
    }
    for (const file of FALLBACK_ENTRY_FILES) {
      candidates.push({ value: file, source: file });
    }
  }

  for (const candidate of uniqueCandidates(candidates)) {
    const resolved = await resolveCandidate(root, candidate.value);
    if (resolved) {
      return resolved;
    }
  }

  const choices = explicitEntry
    ? explicitEntry
    : "package.json main, tunnel.js, or index.js";
  throw new Error(`entry file not found in ${root}: ${choices}`);
}

async function readPackageMain(root) {
  const packageJsonPath = path.join(root, "package.json");
  if (!(await exists(packageJsonPath))) {
    return "";
  }

  const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
  return normalizeEntry(packageJson.main);
}

async function resolveCandidate(root, candidate) {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`entry file must be inside source directory: ${candidate}`);
  }

  const stat = await statOrNull(absolute);
  if (stat?.isFile()) {
    return { absolute, relative };
  }
  if (stat?.isDirectory()) {
    return resolveEntryPath(absolute);
  }

  return null;
}

function normalizeEntry(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.value)) {
      continue;
    }
    seen.add(candidate.value);
    result.push(candidate);
  }
  return result;
}

async function exists(filePath) {
  return Boolean(await statOrNull(filePath));
}

async function statOrNull(filePath) {
  try {
    return await fs.promises.stat(filePath);
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}
