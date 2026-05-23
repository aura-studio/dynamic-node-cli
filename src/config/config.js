import fs from "node:fs";
import yaml from "js-yaml";

export function parseConfig(file) {
  const data = fs.readFileSync(file, "utf8");
  return yaml.load(data);
}

export function validateConfig(config) {
  const allowed = /^[A-Za-z0-9.-]+$/;

  const envNames = new Set();
  if (!Array.isArray(config?.environments) || config.environments.length === 0) {
    throw new Error("config: environments must not be empty");
  }

  config.environments.forEach((env, i) => {
    if (!env?.name) {
      throw new Error(`config: environments[${i}].name must not be empty`);
    }

    const toolchain = env.toolchain ?? {};
    if (
      !toolchain.os ||
      !toolchain.arch ||
      !toolchain.compiler ||
      !toolchain.variant
    ) {
      throw new Error(`config: environments[${i}] toolchain fields must not be empty`);
    }
    if (
      !allowed.test(toolchain.os) ||
      !allowed.test(toolchain.arch) ||
      !allowed.test(toolchain.compiler) ||
      !allowed.test(toolchain.variant)
    ) {
      throw new Error(
        `config: environments[${i}].toolchain fields contain invalid characters (allowed: letters, digits, '.', '-')`,
      );
    }
    if (
      toolchain.variant !== "bundle" &&
      toolchain.variant !== "full"
    ) {
      throw new Error(
        `config: environments[${i}].toolchain.variant must be 'bundle' or 'full'`,
      );
    }

    const warehouse = env.warehouse ?? {};
    if (!warehouse.local) {
      throw new Error(`config: environments[${i}].warehouse.local must not be empty`);
    }
    if (!Array.isArray(warehouse.remote) || warehouse.remote.length === 0) {
      throw new Error(`config: environments[${i}].warehouse.remote must not be empty`);
    }
    warehouse.remote.forEach((remote, j) => {
      if (!remote) {
        throw new Error(
          `config: environments[${i}].warehouse.remote[${j}] must not be empty`,
        );
      }
    });

    envNames.add(env.name);
  });

  if (config.procedures == null) {
    config.procedures = [];
  }
  if (!Array.isArray(config.procedures)) {
    throw new Error("config: procedures must be an array");
  }

  config.procedures.forEach((procedure, i) => {
    if (!procedure?.name) {
      throw new Error(`config: procedures[${i}].name must not be empty`);
    }
    if (!procedure.environment) {
      throw new Error(`config: procedures[${i}].environment must not be empty`);
    }
    if (!envNames.has(procedure.environment)) {
      throw new Error(`config: procedures[${i}].environment not found in environments`);
    }

    const source = procedure.source ?? {};
    if (!source.module || !source.package || !source.version) {
      throw new Error(`config: procedures[${i}] source fields must not be empty`);
    }

    const target = procedure.target ?? {};
    if (!target.namespace || !target.package || !target.version) {
      throw new Error(`config: procedures[${i}] target fields must not be empty`);
    }
    if (!allowed.test(target.namespace)) {
      throw new Error(
        `config: procedures[${i}].target.namespace contains invalid characters`,
      );
    }
    if (!allowed.test(target.package)) {
      throw new Error(
        `config: procedures[${i}].target.package contains invalid characters`,
      );
    }
    if (!allowed.test(target.version)) {
      throw new Error(
        `config: procedures[${i}].target.version contains invalid characters`,
      );
    }
  });
}
