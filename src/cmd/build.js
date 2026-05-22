import { Command } from "commander";
import { buildForProcedure } from "../build/build.js";
import { parseConfig, validateConfig } from "../config/config.js";
import { createProcedure, getAllProcedures } from "../config/procedure.js";
import { DEFAULT_CONFIG_PATHS_TEXT, resolveConfigPath } from "./config-path.js";

export function createBuildCommand() {
  return new Command("build")
    .description("Build Node.js project into zip package")
    .option(
      "-c, --config <path>",
      `path to config file (default: ${DEFAULT_CONFIG_PATHS_TEXT})`,
      "",
    )
    .option(
      "-p, --procedure <name>",
      "procedure name to build (optional, builds all if not specified)",
      "",
    )
    .action(async (options) => {
      const cfgPath = resolveConfigPath(options);
      const config = parseConfig(cfgPath);
      validateConfig(config);

      if (!options.procedure) {
        console.log("No procedure specified, building all procedures...");
        const procedures = getAllProcedures(config);
        for (const procName of procedures) {
          console.log(`\nBuilding procedure: ${procName}`);
          const procObj = createProcedure(config, procName);
          await buildForProcedure(procObj);
        }
        console.log("\nAll procedures built successfully.");
        return;
      }

      const procObj = createProcedure(config, options.procedure);
      await buildForProcedure(procObj);
    });
}
