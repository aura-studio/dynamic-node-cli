import { Command } from "commander";
import {
  callMeta,
  inspectArtifact,
  printMeta,
  readMeta,
} from "../meta/meta.js";

export function createMetaCommand() {
  const metaCmd = new Command("meta")
    .description("Read meta information from a Node artifact")
    .summary("Read artifact meta");

  metaCmd.addCommand(createMetaReadCommand("read", "Read dynamic-meta.json"));
  metaCmd.addCommand(createMetaReadCommand("strings", "Extract meta from printable JSON"));
  metaCmd.addCommand(createMetaCallCommand());
  metaCmd.addCommand(createMetaNmCommand());
  metaCmd.addCommand(createMetaObjdumpCommand());

  return metaCmd;
}

function createMetaReadCommand(name, description) {
  return new Command(name)
    .description(description)
    .argument("<artifact>", "zip, directory, or dynamic-meta.json")
    .option("--json", "print full JSON", false)
    .action(async (artifact, options) => {
      const meta = await readMeta(artifact);
      printMeta(meta, { json: options.json });
    });
}

function createMetaCallCommand() {
  return new Command("call")
    .description("Load the package and call Tunnel.Meta()/meta()")
    .argument("<artifact>", "zip, directory, or JavaScript entry file")
    .option("--json", "print full JSON", false)
    .action(async (artifact, options) => {
      const meta = await callMeta(artifact);
      printMeta(meta, { json: options.json });
    });
}

function createMetaNmCommand() {
  return new Command("nm")
    .description("List Node artifact entries instead of Go symbols")
    .argument("<artifact>", "zip, directory, or JavaScript entry file")
    .action(async (artifact) => {
      const entries = await inspectArtifact(artifact);
      for (const entry of entries) {
        console.log(`${entry.name}\t${entry.uncompressedSize ?? ""}`);
      }
    });
}

function createMetaObjdumpCommand() {
  return new Command("objdump")
    .description("Print low-level artifact manifest")
    .argument("<artifact>", "zip, directory, or JavaScript entry file")
    .action(async (artifact) => {
      const entries = await inspectArtifact(artifact);
      console.log(JSON.stringify(entries, null, 2));
    });
}
