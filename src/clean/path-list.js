import path from "node:path";

export class PathList {
  constructor(warehouse, dirs = [], files = []) {
    this.warehouse = warehouse;
    this.dirs = dirs;
    this.files = files;
  }

  addDir(dir) {
    this.dirs.push(dir);
  }

  addFile(file) {
    this.files.push(file);
  }
}

export function newPathListForProcedure(proc) {
  const name = `${proc.target.namespace}_${proc.target.package}_${proc.target.version}`;
  const environment = [
    proc.toolchain.os,
    proc.toolchain.arch,
    proc.toolchain.compiler,
    proc.toolchain.variant,
  ].join("_");
  const dir = path.join(proc.warehouse.local, environment, name);

  return new PathList(proc.warehouse.local, [dir], [
    path.join(dir, `libnode_${name}.zip`),
  ]);
}
