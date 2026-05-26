import path from "node:path";
import { checkArch, checkCompiler, checkOS } from "../env/check.js";
import { Builder } from "./builder.js";

export async function buildForProcedure(proc) {
  if (!checkOS(proc.toolchain.os)) {
    console.log("Build aborted due to OS mismatch.");
    return;
  }
  if (!checkArch(proc.toolchain.arch)) {
    console.log("Build aborted due to Arch mismatch.");
    return;
  }
  if (!checkCompiler(proc.toolchain.compiler)) {
    console.log("Build aborted due to Compiler mismatch.");
    return;
  }

  const name = `${proc.target.namespace}_${proc.target.package}_${proc.target.version}`;
  const environment = [
    proc.toolchain.os,
    proc.toolchain.arch,
    proc.toolchain.compiler,
    proc.toolchain.variant,
  ].join("_");
  const dir = path.join(proc.warehouse.local, environment, name);

  const renderData = {
    name,
    sourcePath: createSourcePath(proc.source.module, proc.source.package),
    sourceModule: proc.source.module,
    sourcePackage: proc.source.package,
    sourceVersion: proc.source.version,
    entry: proc.source.entry,
    version: proc.source.version,
    house: proc.warehouse.local,
    environment,
    variant: proc.toolchain.variant,
    os: proc.toolchain.os,
    arch: proc.toolchain.arch,
    compiler: proc.toolchain.compiler,
    dir,
  };

  await new Builder(renderData).build();
}

function createSourcePath(moduleName, packageName) {
  if (path.isAbsolute(packageName)) {
    return packageName;
  }
  if (packageName === ".") {
    return moduleName;
  }
  return path.join(moduleName, packageName);
}
