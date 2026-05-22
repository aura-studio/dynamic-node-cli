import { Command } from "commander";
import { parseConfig, validateConfig } from "../config/config.js";
import { createProcedure, getAllProcedures } from "../config/procedure.js";
import { pushForProcedure } from "../push/push.js";
import { resolveConfigPath } from "./config-path.js";

export function createPushCommand() {
  return new Command("push")
    .description("Push build artifacts to S3 warehouse")
    .option(
      "-c, --config <path>",
      "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml or ./dynamic-node-cli.yml)",
      "",
    )
    .option(
      "-p, --procedure <name>",
      "procedure name to push (optional, pushes all if not specified)",
      "",
    )
    .action(async (options) => {
      const cfgPath = resolveConfigPath(options);
      const config = parseConfig(cfgPath);
      validateConfig(config);

      if (!options.procedure) {
        console.log("No procedure specified, pushing all procedures...");
        const procedures = getAllProcedures(config);
        for (const procName of procedures) {
          console.log(`\nPushing procedure: ${procName}`);
          const procObj = createProcedure(config, procName);
          await pushForProcedure(procObj);
        }
        console.log("\nAll procedures pushed successfully.");
        return;
      }

      const procObj = createProcedure(config, options.procedure);
      await pushForProcedure(procObj);
    });
}
