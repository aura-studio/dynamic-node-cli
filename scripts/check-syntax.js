#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "scripts", "test", "examples/scripts"].filter((root) =>
  fs.existsSync(root),
);
const files = [];

for (const root of roots) {
  walk(root, (filePath) => {
    if (filePath.endsWith(".js")) {
      files.push(filePath);
    }
  });
}

for (const filePath of files) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    stdio: "inherit",
    shell: false,
  });
  if (result.error || result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`checked ${files.length} JavaScript file(s)`);

function walk(dir, visit) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const current = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(current, visit);
      continue;
    }
    visit(current);
  }
}
