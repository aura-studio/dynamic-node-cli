package clean

import (
	"github.com/aura-studio/dynamic-node-cli/config"
)

// CleanForProcedure executes clean operations for a given procedure and type.
func CleanForProcedure(proc config.Procedure, t CleanType) {
	pl := NewPathListForProcedure(proc)
	c := New(pl)
	c.Clean(t)
}
