import { Command } from "commander";
import { parseConfig, validateConfig } from "../config/config.js";
import { createProcedure, getAllProcedures } from "../config/procedure.js";
import { pullForProcedure } from "../pull/pull.js";
import { resolveConfigPath } from "./config-path.js";

export function createPullCommand() {
  return new Command("pull")
    .description("Pull artifacts from S3 warehouse to local")
    .option(
      "-c, --config <path>",
      "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml or ./dynamic-node-cli.yml)",
      "",
    )
    .option(
      "-p, --procedure <name>",
      "procedure name to pull (optional, pulls all if not specified)",
      "",
    )
    .option(
      "-j, --concurrency <number>",
      "max concurrent downloads per remote",
      (value) => Number.parseInt(value, 10),
      8,
    )
    .option("-f, --force", "overwrite existing local files", false)
    .option("--remote <remote>", "override warehouse.remote (pull from this remote only)", "")
    .action(async (options) => {
      const cfgPath = resolveConfigPath(options);
      const config = parseConfig(cfgPath);
      validateConfig(config);

      const opt = {
        concurrency: options.concurrency,
        force: options.force,
        remote: options.remote,
      };

      if (!options.procedure) {
        console.log("No procedure specified, pulling all procedures...");
        const procedures = getAllProcedures(config);
        for (const procName of procedures) {
          console.log(`\nPulling procedure: ${procName}`);
          const procObj = createProcedure(config, procName);
          await pullForProcedure(procObj, { ...opt });
        }
        console.log("\nAll procedures pulled successfully.");
        return;
      }

      const procObj = createProcedure(config, options.procedure);
      await pullForProcedure(procObj, opt);
    });
}
