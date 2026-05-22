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
import { resolveConfigPath } from "./config-path.js";

export function createToolchainCommand() {
  const toolchainCmd = new Command("toolchain")
    .description("Toolchain utilities")
    .summary("Toolchain utilities");

  toolchainCmd.addCommand(createToolchainCheckCommand());
  toolchainCmd.addCommand(createToolchainDescribeCommand());

  return toolchainCmd;
}

function createToolchainCheckCommand() {
  return new Command("check")
    .description("Check OS / Arch / Compiler in one run")
    .option(
      "-c, --config <path>",
      "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml if exists)",
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
