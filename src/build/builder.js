import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build as esbuild } from "esbuild";
import yazl from "yazl";

export class Builder {
  constructor(config) {
    this.config = config;
  }

  async build() {
    console.log("start...");
    try {
      await fs.promises.mkdir(this.config.dir, { recursive: true, mode: 0o755 });
      this.npmInstall();

      if (this.config.variant === "full") {
        await this.buildFull();
      } else {
        await this.buildBundle();
      }
    } finally {
      console.log("done!");
    }
  }

  npmInstall() {
    const srcPath = this.resolveSourcePath();
    console.log(`npm install in ${srcPath}`);

    const result = spawnSync("npm", ["install"], {
      cwd: srcPath,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    if (result.error || result.status !== 0) {
      throw new Error(`npm install failed: ${result.error?.message ?? result.status}`);
    }
  }

  async buildBundle() {
    const srcPath = this.resolveSourcePath();
    const entryPoint = path.join(srcPath, this.config.entry);

    console.log(`esbuild bundle ${entryPoint}`);

    await esbuild({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: path.join(this.config.dir, "bundle.js"),
      platform: "node",
      format: "cjs",
      write: true,
      logLevel: "info",
    });

    const zipName = `libnode_${this.config.name}.zip`;
    const zipPath = path.join(this.config.dir, zipName);
    await this.createBundleZip(zipPath);

    const backupPath = `${zipPath}.${timestampSuffix()}`;
    await fs.promises.copyFile(zipPath, backupPath);

    console.log(`output: ${zipPath}`);
  }

  async buildFull() {
    const srcPath = this.resolveSourcePath();

    const zipName = `libnode_${this.config.name}.zip`;
    const zipPath = path.join(this.config.dir, zipName);

    console.log(`full zip ${srcPath} -> ${zipPath}`);
    await this.createFullZip(zipPath, srcPath);

    const backupPath = `${zipPath}.${timestampSuffix()}`;
    await fs.promises.copyFile(zipPath, backupPath);

    console.log(`output: ${zipPath}`);
  }

  resolveSourcePath() {
    if (path.isAbsolute(this.config.sourcePath)) {
      return this.config.sourcePath;
    }
    return path.join(process.cwd(), this.config.sourcePath);
  }

  async createBundleZip(zipPath) {
    const bundlePath = path.join(this.config.dir, "bundle.js");
    await writeZip(zipPath, (zipfile) => {
      zipfile.addFile(bundlePath, "bundle.js");
    });
  }

  async createFullZip(zipPath, srcDir) {
    await writeZip(zipPath, async (zipfile) => {
      await addDirectoryToZip(zipfile, srcDir, srcDir);
    });
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
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
