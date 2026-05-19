package push

import "github.com/aura-studio/dynamic-node-cli/config"

// PushForProcedure executes push operations for a given procedure.
func PushForProcedure(proc config.Procedure) {
	tl := NewTaskList(proc)
	for remote, tasks := range tl.Tasks {
		r := NewS3Remote(remote)
		r.Push(tasks)
	}
}
