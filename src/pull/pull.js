import { newRemote } from "./puller.js";

export async function pullForProcedure(proc, opt) {
  if (opt.concurrency <= 0) {
    opt.concurrency = 8;
  }

  let remotes = proc.warehouse.remote;
  if (opt.remote) {
    remotes = [opt.remote];
  }

  if (remotes.length === 0) {
    throw new Error("pull: no warehouse.remote configured");
  }

  const name = `${proc.target.namespace}_${proc.target.package}_${proc.target.version}`;
  const environment = [
    proc.toolchain.os,
    proc.toolchain.arch,
    proc.toolchain.compiler,
    proc.toolchain.variant,
  ].join("_");

  for (const remote of remotes) {
    const source = newRemote(remote);
    const count = await source.pullArtifacts(
      environment,
      name,
      proc.warehouse.local,
      opt,
    );
    console.log(`Pulled ${count} file(s) from ${remote}`);
  }
}
