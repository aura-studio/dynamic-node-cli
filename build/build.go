package build

import (
	"fmt"

	"github.com/aura-studio/dynamic-node-cli/config"
	"github.com/aura-studio/dynamic-node-cli/env"
)

// BuildForProcedure executes build operations for a given procedure.
func BuildForProcedure(proc config.Procedure) {
	if !env.CheckOS(proc.Toolchain.OS) {
		fmt.Println("Build aborted due to OS mismatch.")
		return
	}
	if !env.CheckArch(proc.Toolchain.Arch) {
		fmt.Println("Build aborted due to Arch mismatch.")
		return
	}
	if !env.CheckCompiler(proc.Toolchain.Compiler) {
		fmt.Println("Build aborted due to Compiler mismatch.")
		return
	}

	// Compose build parameters from Procedure
	name := proc.Target.Namespace + "_" + proc.Target.Package + "_" + proc.Target.Version
	environ := proc.Toolchain.OS + "_" + proc.Toolchain.Arch + "_" + proc.Toolchain.Compiler + "_" + proc.Toolchain.Variant
	dir := proc.Warehouse.Local + "/" + environ + "/" + name

	rd := &RenderData{
		Name:        name,
		SourcePath:  proc.Source.Path,
		Entry:       proc.Source.Entry,
		Version:     proc.Source.Version,
		House:       proc.Warehouse.Local,
		Environment: environ,
		Variant:     proc.Toolchain.Variant,
		OS:          proc.Toolchain.OS,
		Arch:        proc.Toolchain.Arch,
		Compiler:    proc.Toolchain.Compiler,
		Dir:         dir,
	}

	New(rd).Build()
}
