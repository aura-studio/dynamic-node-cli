package push

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"strings"

	"github.com/aura-studio/dynamic-node-cli/config"
)

// TaskList holds push tasks grouped by remote.
type TaskList struct {
	Tasks map[string][]Pair
}

// Pair represents a local-to-remote file mapping.
type Pair struct {
	RemoteFilePath string
	LocalFilePath  string
}

// Add appends a task to the list for a given remote.
func (f *TaskList) Add(remote string, remoteFilePath string, localFilePath string) {
	f.Tasks[remote] = append(f.Tasks[remote], Pair{
		RemoteFilePath: remoteFilePath,
		LocalFilePath:  localFilePath,
	})
}

// NewTaskList creates a TaskList by scanning the warehouse for .zip artifacts.
func NewTaskList(proc config.Procedure) *TaskList {
	fileList := &TaskList{Tasks: make(map[string][]Pair)}

	name := proc.Target.Namespace + "_" + proc.Target.Package + "_" + proc.Target.Version
	env := proc.Toolchain.OS + "_" + proc.Toolchain.Arch + "_" + proc.Toolchain.Compiler + "_" + proc.Toolchain.Variant
	dir := filepath.Join(proc.Warehouse.Local, env, name)

	// Expected filename: libnode_<name>.zip
	libnodeName := fmt.Sprintf("libnode_%s.zip", name)

	for _, remote := range proc.Warehouse.Remote {
		if err := filepath.WalkDir(proc.Warehouse.Local, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			// Only consider files inside the expected dir
			if !strings.HasPrefix(path, dir) {
				return nil
			}
			base := filepath.Base(path)
			// Match primary artifact and timestamped backups
			if base == libnodeName || strings.HasPrefix(base, libnodeName+".") {
				rel, relErr := filepath.Rel(proc.Warehouse.Local, path)
				if relErr != nil {
					return relErr
				}
				remotePath := filepath.ToSlash(rel)
				fileList.Add(remote, remotePath, path)
			}
			return nil
		}); err != nil {
			panic(err)
		}
	}

	return fileList
}
