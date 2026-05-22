export function getAllProcedures(config) {
  return config.procedures.map((procedure) => procedure.name);
}

export function createProcedure(config, procedureName) {
  if (!procedureName) {
    throw new Error("procedure: procedure name must not be empty");
  }

  const procedure = config.procedures.find((item) => item.name === procedureName);
  if (!procedure) {
    throw new Error(`procedure: procedure '${procedureName}' not found`);
  }

  const environment = config.environments.find(
    (item) => item.name === procedure.environment,
  );
  if (!environment) {
    throw new Error(
      `procedure: environment '${procedure.environment}' not found for procedure '${procedureName}'`,
    );
  }

  return {
    toolchain: {
      os: environment.toolchain.os,
      arch: environment.toolchain.arch,
      compiler: environment.toolchain.compiler,
      variant: environment.toolchain.variant,
    },
    warehouse: {
      local: environment.warehouse.local,
      remote: [...environment.warehouse.remote],
    },
    source: {
      path: procedure.source.path,
      entry: procedure.source.entry,
      version: procedure.source.version,
    },
    target: {
      namespace: procedure.target.namespace,
      package: procedure.target.package,
      version: procedure.target.version,
    },
  };
}
