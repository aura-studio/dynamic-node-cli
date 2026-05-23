import { Command } from "commander";
import { createBuildCommand } from "./build.js";
import { createCleanCommand } from "./clean.js";
import { createMetaCommand } from "./meta.js";
import { createPullCommand } from "./pull.js";
import { createPushCommand } from "./push.js";
import { createToolchainCommand } from "./toolchain.js";
import { createVersionCommand } from "./version.js";

export async function execute(argv = process.argv) {
  const rootCmd = new Command();

  rootCmd
    .name("dynamic-node")
    .description(
      "dynamic-node is a CLI driven by dynamic-node-cli.yaml for build/push/pull/clean and toolchain utilities for Node.js projects.",
    )
    .summary("dynamic-node build tool");

  rootCmd.addCommand(createBuildCommand());
  rootCmd.addCommand(createPushCommand());
  rootCmd.addCommand(createPullCommand());
  rootCmd.addCommand(createCleanCommand());
  rootCmd.addCommand(createMetaCommand());
  rootCmd.addCommand(createToolchainCommand());
  rootCmd.addCommand(createVersionCommand());

  await rootCmd.parseAsync(argv);
}
