import fs from "node:fs";
import path from "node:path";

export const CleanTypeCache = "cache";
export const CleanTypePackage = "package";
export const CleanTypeAll = "all";
export const CleanTypeUseless = "useless";

export class Cleaner {
  constructor(pathList) {
    this.pathList = pathList;
  }

  async clean(cleanType) {
    switch (cleanType) {
      case CleanTypeCache:
        await this.cleanCache();
        return;
      case CleanTypePackage:
        await this.cleanPackage();
        return;
      case CleanTypeAll:
        await this.cleanAll();
        return;
      case CleanTypeUseless:
        await this.cleanUseless();
        return;
      default:
        throw new Error(`clean type not found: ${cleanType}`);
    }
  }

  async cleanAll() {
    const warehouse = this.pathList.warehouse;
    if (!(await exists(warehouse))) {
      return;
    }

    const entries = await fs.promises.readdir(warehouse, { withFileTypes: true });
    for (const entry of entries) {
      const current = path.join(warehouse, entry.name);
      console.error(`clean remove ${current}`);
      if (entry.isDirectory()) {
        await fs.promises.rm(current, { recursive: true, force: true });
      } else {
        await fs.promises.rm(current, { force: true });
      }
    }
  }

  async cleanPackage() {
    const warehouse = this.pathList.warehouse;
    if (!(await exists(warehouse))) {
      return;
    }

    await walkFiles(warehouse, async (filePath, entry) => {
      const name = entry.name.toLowerCase();
      if (name.includes(".zip")) {
        console.error(`clean remove artifact ${filePath}`);
        await fs.promises.rm(filePath, { force: true });
      }
    });
  }

  async cleanCache() {
    const warehouse = this.pathList.warehouse;
    if (!(await exists(warehouse))) {
      return;
    }

    await walkFiles(warehouse, async (filePath, entry) => {
      const name = entry.name.toLowerCase();
      if (name.includes(".zip")) {
        return;
      }
      console.error(`clean remove non-artifact ${filePath}`);
      await fs.promises.rm(filePath, { force: true });
    });
  }

  async cleanUseless() {
    const warehouse = this.pathList.warehouse;
    if (!(await exists(warehouse))) {
      return;
    }

    await walkFiles(warehouse, async (filePath, entry) => {
      const ext = path.extname(entry.name.toLowerCase());
      if (ext === ".zip") {
        return;
      }
      console.error(`clean remove ${filePath}`);
      await fs.promises.rm(filePath, { force: true });
    });
  }
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

async function walkFiles(root, visit) {
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(current, visit);
      continue;
    }
    await visit(current, entry);
  }
}
