#!/usr/bin/env node

import { execute } from "./cmd/root.js";

try {
  await execute(process.argv);
} catch (err) {
  if (err?.code === "commander.helpDisplayed") {
    process.exit(0);
  }
  console.error("error:", err?.message ?? err);
  process.exit(1);
}
