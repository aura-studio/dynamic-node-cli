import { Command } from "commander";
import { cleanForProcedure } from "../clean/clean.js";
import {
  CleanTypeAll,
  CleanTypeCache,
  CleanTypePackage,
  CleanTypeUseless,
} from "../clean/cleaner.js";
import { parseConfig, validateConfig } from "../config/config.js";
import { createProcedure, getAllProcedures } from "../config/procedure.js";
import { resolveConfigPath } from "./config-path.js";

export function createCleanCommand() {
  const cleanCmd = new Command("clean")
    .description("Clean build artifacts")
    .summary("Clean build artifacts");

  cleanCmd.addCommand(createCleanAllCommand());
  cleanCmd.addCommand(createCleanCacheCommand());
  cleanCmd.addCommand(createCleanPackageCommand());
  cleanCmd.addCommand(createCleanUselessCommand());

  return cleanCmd;
}

function addCleanOptions(command) {
  return command
    .option(
      "-c, --config <path>",
      "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml or ./dynamic-node-cli.yml)",
      "",
    )
    .option("-p, --procedure <name>", "procedure name to select warehouse (optional)", "");
}

function createCleanAllCommand() {
  return addCleanOptions(
    new Command("all")
      .description("Remove the entire warehouse")
      .addHelpText(
        "after",
        "\nExamples:\n  dynamic-node clean all -c ./dynamic-node-cli.yaml\n  dynamic-node clean all -c ./dynamic-node-cli.yaml -p my-app\n",
      ),
  ).action(async (options) => {
    const { config, procedureName } = loadCleanConfig(options);
    const procName = procedureName || config.procedures[0].name;
    const proc = createProcedure(config, procName);
    await cleanForProcedure(proc, CleanTypeAll);
  });
}

function createCleanCacheCommand() {
  return addCleanOptions(
    new Command("cache")
      .description("Clean cache (keep .zip artifacts)")
      .addHelpText(
        "after",
        "\nExamples:\n  dynamic-node clean cache -c ./dynamic-node-cli.yaml -p my-app\n",
      ),
  ).action(async (options) => {
    const { config, procedureName } = loadCleanConfig(options);

    if (!procedureName) {
      console.log("No procedure specified, cleaning cache for all procedures...");
      const procedures = getAllProcedures(config);
      for (const procName of procedures) {
        console.log(`\nCleaning cache for procedure: ${procName}`);
        const proc = createProcedure(config, procName);
        await cleanForProcedure(proc, CleanTypeCache);
      }
      console.log("\nCache cleaned for all procedures.");
      return;
    }

    const proc = createProcedure(config, procedureName);
    await cleanForProcedure(proc, CleanTypeCache);
  });
}

function createCleanPackageCommand() {
  return addCleanOptions(
    new Command("package")
      .description("Remove .zip artifacts")
      .addHelpText(
        "after",
        "\nExamples:\n  dynamic-node clean package -c ./dynamic-node-cli.yaml -p my-app\n",
      ),
  ).action(async (options) => {
    const { config, procedureName } = loadCleanConfig(options);

    if (!procedureName) {
      console.log("No procedure specified, cleaning package for all procedures...");
      const procedures = getAllProcedures(config);
      for (const procName of procedures) {
        console.log(`\nCleaning package for procedure: ${procName}`);
        const proc = createProcedure(config, procName);
        await cleanForProcedure(proc, CleanTypePackage);
      }
      console.log("\nPackage cleaned for all procedures.");
      return;
    }

    const proc = createProcedure(config, procedureName);
    await cleanForProcedure(proc, CleanTypePackage);
  });
}

function createCleanUselessCommand() {
  return addCleanOptions(
    new Command("useless")
      .description("Remove non-.zip files")
      .addHelpText(
        "after",
        "\nExamples:\n  dynamic-node clean useless -c ./dynamic-node-cli.yaml\n  dynamic-node clean useless -c ./dynamic-node-cli.yaml -p my-app\n",
      ),
  ).action(async (options) => {
    const { config, procedureName } = loadCleanConfig(options);
    const procName = procedureName || config.procedures[0].name;
    const proc = createProcedure(config, procName);
    await cleanForProcedure(proc, CleanTypeUseless);
  });
}

function loadCleanConfig(options) {
  const cfgPath = resolveConfigPath(options);
  const config = parseConfig(cfgPath);
  validateConfig(config);
  return {
    config,
    procedureName: options.procedure,
  };
}
