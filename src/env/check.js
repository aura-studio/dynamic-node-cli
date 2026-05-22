import { getArch, getCompiler, getOS } from "./env.js";

export function checkOS(targetOS) {
  if (!targetOS) {
    return true;
  }

  const actualOS = getOS().toLowerCase().trim();
  if (!actualOS) {
    warnf(`cannot detect OS (target=${targetOS})`);
    return false;
  }

  const expected = targetOS.toLowerCase().trim();
  if (actualOS !== expected) {
    warnf(`OS mismatch (target=${expected} actual=${actualOS})`);
    return false;
  }
  okf(`OS match (target=${expected} actual=${actualOS})`);
  return true;
}

export function checkArch(targetArch) {
  if (!targetArch) {
    return true;
  }

  const actual = getArch();
  if (!actual) {
    warnf(`cannot detect arch (target=${targetArch})`);
    return false;
  }

  const expected = targetArch.toLowerCase().trim();
  const actualLower = actual.toLowerCase();

  if (expected === actualLower) {
    okf(`ARCH match (target=${expected} actual=${actualLower})`);
    return true;
  }
  warnf(`ARCH mismatch (target=${expected} actual=${actualLower})`);
  return false;
}

export function checkCompiler(targetCompiler) {
  if (!targetCompiler) {
    return true;
  }

  const actual = getCompiler();
  if (!actual) {
    warnf(`cannot detect Node.js version (target=${targetCompiler})`);
    return false;
  }

  const expected = targetCompiler.trim();
  if (actual === expected) {
    okf(`COMPILER match (target=${expected} actual=${actual})`);
    return true;
  }
  warnf(`COMPILER mismatch (target=${expected} actual=${actual})`);
  return false;
}

function warnf(message) {
  console.error(`fail: ${message}`);
}

function okf(message) {
  console.log(`pass: ${message}`);
}
