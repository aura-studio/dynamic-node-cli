import fs from "node:fs";
import path from "node:path";

export class TaskList {
  constructor() {
    this.tasks = new Map();
  }

  add(remote, remoteFilePath, localFilePath) {
    const tasks = this.tasks.get(remote) ?? [];
    tasks.push({ remoteFilePath, localFilePath });
    this.tasks.set(remote, tasks);
  }
}

export async function newTaskList(proc) {
  const fileList = new TaskList();

  const name = `${proc.target.namespace}_${proc.target.package}_${proc.target.version}`;
  const environment = [
    proc.toolchain.os,
    proc.toolchain.arch,
    proc.toolchain.compiler,
    proc.toolchain.variant,
  ].join("_");
  const dir = path.join(proc.warehouse.local, environment, name);
  const libnodeName = `libnode_${name}.zip`;

  for (const remote of proc.warehouse.remote) {
    await walkFiles(proc.warehouse.local, async (filePath) => {
      if (!filePath.startsWith(dir)) {
        return;
      }

      const base = path.basename(filePath);
      if (base === libnodeName || base.startsWith(`${libnodeName}.`)) {
        const rel = path.relative(proc.warehouse.local, filePath);
        const remotePath = toRemotePath(rel);
        fileList.add(remote, remotePath, filePath);
      }
    });
  }

  return fileList;
}

async function walkFiles(root, visit) {
  const entries = await fs.promises.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(current, visit);
      continue;
    }
    await visit(current);
  }
}

function toRemotePath(value) {
  return value.split(path.sep).join("/");
}
