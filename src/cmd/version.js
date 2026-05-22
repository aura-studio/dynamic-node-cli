import os from "node:os";
import process from "node:process";
import { Command } from "commander";

export const Version = process.env.VERSION || "dev";

export function createVersionCommand() {
  return new Command("version")
    .description("Print version information")
    .action(() => {
      console.log(`Version: ${Version}`);
      console.log(`Node:    ${process.version} ${process.platform}/${os.arch()}`);
    });
}
