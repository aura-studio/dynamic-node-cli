package pull

import (
	"fmt"
	"log"

	"github.com/aura-studio/dynamic-node-cli/config"
)

// Options holds pull configuration.
type Options struct {
	Concurrency int
	Force       bool
	Remote      string // optional: override procedure.warehouse.remote
}

// PullForProcedure downloads warehouse artifacts from remote(s) to local warehouse for a given procedure.
func PullForProcedure(proc config.Procedure, opt Options) {
	if opt.Concurrency <= 0 {
		opt.Concurrency = 8
	}

	remotes := proc.Warehouse.Remote
	if opt.Remote != "" {
		remotes = []string{opt.Remote}
	}

	if len(remotes) == 0 {
		log.Panicf("pull: no warehouse.remote configured")
	}

	name := proc.Target.Namespace + "_" + proc.Target.Package + "_" + proc.Target.Version
	env := proc.Toolchain.OS + "_" + proc.Toolchain.Arch + "_" + proc.Toolchain.Compiler + "_" + proc.Toolchain.Variant

	for _, remote := range remotes {
		r := newRemote(remote)
		count, err := r.PullArtifacts(env, name, proc.Warehouse.Local, opt)
		if err != nil {
			log.Panicf("pull: remote %q failed: %v", remote, err)
		}
		fmt.Printf("Pulled %d file(s) from %s\n", count, remote)
	}
}
