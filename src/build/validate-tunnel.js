import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveEntryPath } from "./entry.js";

export async function validateTunnelEntry(entryPoint) {
  const entry = await resolveEntryPath(entryPoint);
  const mod = await import(pathToFileURL(path.resolve(entry.absolute)).href);
  const tunnel = await resolveTunnel(mod);

  if (!hasCoreTunnelMethods(tunnel)) {
    throw new Error(
      "build: target must export a Tunnel object or New() factory that implements Init/Invoke/Close or init/invoke/close",
    );
  }
}

async function resolveTunnel(mod) {
  if (isObject(mod?.Tunnel)) {
    return mod.Tunnel;
  }
  if (typeof mod?.New === "function") {
    return await mod.New();
  }
  if (isObject(mod?.default)) {
    if (isObject(mod.default.Tunnel)) {
      return mod.default.Tunnel;
    }
    if (typeof mod.default.New === "function") {
      return await mod.default.New();
    }
    return mod.default;
  }
  if (typeof mod?.default === "function") {
    return await mod.default();
  }
  throw new Error("build: target must export Tunnel, New, or default");
}

function isObject(value) {
  return Boolean(value && (typeof value === "object" || typeof value === "function"));
}

function hasCoreTunnelMethods(value) {
  const lower = ["init", "invoke", "close"].every((name) => typeof value?.[name] === "function");
  const upper = ["Init", "Invoke", "Close"].every((name) => typeof value?.[name] === "function");
  return lower || upper;
}
