import fs from "node:fs";

export function resolveConfigPath(options) {
  if (options.config) {
    return options.config;
  }

  const defaultYaml = "dynamic-node-cli.yaml";
  if (fs.existsSync(defaultYaml)) {
    return defaultYaml;
  }

  const defaultYml = "dynamic-node-cli.yml";
  if (fs.existsSync(defaultYml)) {
    return defaultYml;
  }

  throw new Error(
    "config file not found (use -c <path>), or place dynamic-node-cli.yaml/dynamic-node-cli.yml in current directory",
  );
}
