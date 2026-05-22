import fs from "node:fs";
import { execFileSync } from "node:child_process";

export function getOS() {
  const platform = process.platform.toLowerCase().trim();

  switch (platform) {
    case "linux":
      return detectLinuxDescriptor() || "linux";
    case "win32": {
      const version = detectWindowsVersion();
      return version ? `windows${version}` : "windows";
    }
    case "darwin": {
      const version = detectDarwinVersion();
      return version ? `darwin${version}` : "darwin";
    }
    default:
      return platform;
  }
}

function detectLinuxDescriptor() {
  let data;
  try {
    data = fs.readFileSync("/etc/os-release", "utf8");
  } catch {
    return "";
  }

  const values = new Map();
  for (const rawLine of data.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index < 0) {
      continue;
    }
    const key = line.slice(0, index);
    const value = line.slice(index + 1).replace(/^"|"$/g, "");
    values.set(key, value);
  }

  const id = (values.get("ID") ?? "").toLowerCase().trim();
  const version = (values.get("VERSION_ID") ?? "").trim();
  if (!id || !version) {
    return "";
  }
  return id + version.trim();
}

function detectWindowsVersion() {
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[System.Environment]::OSVersion.Version.ToString()",
      ],
      { encoding: "utf8" },
    );
    const version = out.trim();
    if (version) {
      return version;
    }
  } catch {
    // Fall back to cmd below.
  }

  try {
    const out = execFileSync("cmd", ["/c", "ver"], { encoding: "utf8" });
    return extractFirstVersionLikeToken(out);
  } catch {
    return "";
  }
}

function detectDarwinVersion() {
  try {
    const out = execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" });
    const version = out.trim();
    if (version) {
      return version;
    }
  } catch {
    // Fall back to uname below.
  }

  try {
    return execFileSync("uname", ["-r"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function extractFirstVersionLikeToken(value) {
  const match = value.trim().match(/\d[\d.]*/);
  return match ? match[0] : "";
}

export function getArch() {
  switch (process.arch) {
    case "x64":
      return "amd64v1";
    case "arm64":
      return "arm64v8";
    case "arm": {
      const armVersion = process.config?.variables?.arm_version;
      return armVersion ? `armv${armVersion}` : "arm";
    }
    case "ia32":
      return "386";
    default:
      return process.arch.toLowerCase().trim();
  }
}

export function getCompiler() {
  const version = process.version.replace(/^v/, "").trim();
  if (!version) {
    return "";
  }
  return `node${version}`;
}

export function getCompilerMajor() {
  const version = process.version.replace(/^v/, "").trim();
  if (!version) {
    return "";
  }
  return `node${version.split(".", 1)[0]}`;
}
