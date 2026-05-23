import { Command } from "commander";
import { parseConfig, validateConfig } from "../config/config.js";
import { createProcedure } from "../config/procedure.js";
import {
  check,
  describe,
  KindArch,
  KindCompiler,
  KindOS,
} from "../toolchain/check.js";
import { DEFAULT_CONFIG_PATHS_TEXT, resolveConfigPath } from "./config-path.js";

export function createToolchainCommand() {
  const toolchainCmd = new Command("toolchain")
    .description("Toolchain utilities")
    .summary("Toolchain utilities");

  toolchainCmd.addCommand(createToolchainCheckCommand());
  toolchainCmd.addCommand(createToolchainDescribeCommand());
  toolchainCmd.addCommand(createToolchainScriptCommand());

  return toolchainCmd;
}

function createToolchainScriptCommand() {
  return new Command("script")
    .description("Emit a bash env script")
    .action(() => {
      const values = {
        DYNAMIC_OS: describe(KindOS),
        DYNAMIC_ARCH: describe(KindArch),
        DYNAMIC_COMPILER: describe(KindCompiler),
      };

      console.log("#!/usr/bin/env bash");
      console.log("set -euo pipefail");
      for (const [key, value] of Object.entries(values)) {
        console.log(`export ${key}=${bashSingleQuote(value)}`);
      }
    });
}

function bashSingleQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function createToolchainCheckCommand() {
  return new Command("check")
    .description("Check OS / Arch / Compiler in one run")
    .option(
      "-c, --config <path>",
      `path to config file (default: ${DEFAULT_CONFIG_PATHS_TEXT})`,
      "",
    )
    .option("-p, --procedure <name>", "procedure name to check (required)", "")
    .action((options) => {
      if (!options.procedure) {
        throw new Error("procedure is required");
      }

      const cfgPath = resolveConfigPath(options);
      const config = parseConfig(cfgPath);
      validateConfig(config);
      const proc = createProcedure(config, options.procedure);

      const expected = {
        os: proc.toolchain.os,
        arch: proc.toolchain.arch,
        compiler: proc.toolchain.compiler,
      };
      if (!check(expected)) {
        process.exit(1);
      }
    });
}

function createToolchainDescribeCommand() {
  return new Command("describe")
    .description("Print current toolchain values")
    .argument("<kind>", "os|arch|compiler|all")
    .action((kindValue) => {
      const kind = kindValue.toLowerCase().trim();
      switch (kind) {
        case KindOS:
          console.log(describe(KindOS));
          return;
        case KindArch:
          console.log(describe(KindArch));
          return;
        case KindCompiler:
          console.log(describe(KindCompiler));
          return;
        case "all":
          console.log(`OS: ${describe(KindOS)}`);
          console.log(`Arch: ${describe(KindArch)}`);
          console.log(`Compiler: ${describe(KindCompiler)}`);
          return;
        default:
          throw new Error("kind must be one of: os, arch, compiler, all");
      }
    });
}
