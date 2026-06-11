import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

/**
 * Extracts a pulled libnode zip next to itself so the runtime loader
 * (dynamic-node >= v1.0.2) can require() the package straight from the
 * read-only warehouse with zero runtime extraction — measured at 26-28s
 * for a full-variant package under provisioned-concurrency init otherwise.
 *
 * The zip itself is kept: loaders older than v1.0.2 ignore the extracted
 * form and still extract the zip to a writable path at runtime, so a
 * warehouse carrying both forms works with either loader generation.
 *
 * When `force` is false (download skipped because the zip already exists),
 * extraction is skipped too if a loadable form is already present, keeping
 * repeated pulls cheap and idempotent.
 */
export function ensureExtracted(zipPath, force) {
  const dir = path.dirname(zipPath);
  if (!force && hasLoadableForm(dir)) {
    return;
  }
  console.log(`extracting ${path.basename(zipPath)} -> ${dir}`);
  new AdmZip(zipPath).extractAllTo(dir, true);
}

// Mirrors the loadable-form probe in dynamic-node's Local warehouse:
// bundle.js for the bundle variant, index.js / package.json for full.
// Both variants ship a root package.json, so this covers either.
function hasLoadableForm(dir) {
  return ["bundle.js", "index.js", "package.json"].some((file) => {
    try {
      return fs.statSync(path.join(dir, file)).size > 0;
    } catch {
      return false;
    }
  });
}
