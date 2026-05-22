import fs from "node:fs";

export const DEFAULT_CONFIG_PATHS = [
  "dynamic-node-cli.yaml",
  "dynamic-node-cli.yml",
  "dynamic-cli.yaml",
  "dynamic-cli.yml",
];

export const DEFAULT_CONFIG_PATHS_TEXT = DEFAULT_CONFIG_PATHS
  .map((configPath) => `./${configPath}`)
  .join(", ");

export function resolveConfigPath(options) {
  if (options.config) {
    return options.config;
  }

  for (const configPath of DEFAULT_CONFIG_PATHS) {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }

  throw new Error(
    `config file not found (use -c <path>), or place one of ${DEFAULT_CONFIG_PATHS_TEXT} in current directory`,
  );
}
