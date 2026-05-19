package clean

import (
	"path/filepath"

	"github.com/aura-studio/dynamic-node-cli/config"
)

// PathList holds warehouse paths for clean operations.
type PathList struct {
	WareHouse string
	Dirs      []string
	Files     []string
}

// AddDir adds a directory path.
func (f *PathList) AddDir(dir string) {
	f.Dirs = append(f.Dirs, dir)
}

// AddFile adds a file path.
func (f *PathList) AddFile(file string) {
	f.Files = append(f.Files, file)
}

// NewPathListForProcedure constructs paths aligned with Procedure-based build outputs.
// Dir = Warehouse.Local / OS_Arch_Compiler_Variant / Namespace_Package_Version
// Files include libnode_<name>.zip under Dir.
func NewPathListForProcedure(proc config.Procedure) *PathList {
	name := proc.Target.Namespace + "_" + proc.Target.Package + "_" + proc.Target.Version
	env := proc.Toolchain.OS + "_" + proc.Toolchain.Arch + "_" + proc.Toolchain.Compiler + "_" + proc.Toolchain.Variant
	dir := filepath.Join(proc.Warehouse.Local, env, name)

	pl := &PathList{
		WareHouse: proc.Warehouse.Local,
		Dirs:      []string{dir},
		Files: []string{
			filepath.Join(dir, "libnode_"+name+".zip"),
		},
	}
	return pl
}
