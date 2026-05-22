import { checkArch, checkCompiler, checkOS } from "../env/check.js";
import { getArch, getCompiler, getOS } from "../env/env.js";

export const KindOS = "os";
export const KindArch = "arch";
export const KindCompiler = "compiler";

export function detect() {
  return {
    os: getOS(),
    arch: getArch(),
    compiler: getCompiler(),
  };
}

export function describe(kind) {
  switch (kind) {
    case KindOS:
      return getOS();
    case KindArch:
      return getArch();
    case KindCompiler:
      return getCompiler();
    default:
      return "";
  }
}

export function check(expected) {
  let ok = true;
  ok = checkOS(expected.os) && ok;
  ok = checkArch(expected.arch) && ok;
  ok = checkCompiler(expected.compiler) && ok;
  return ok;
}
