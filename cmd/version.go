package cmd

import (
	"fmt"
	"runtime"
	"runtime/debug"

	"github.com/spf13/cobra"
)

// Version can be overridden via -ldflags "-X github.com/aura-studio/dynamic-node-cli/cmd.Version=v1.0.0"
var (
	Version = "dev"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version information",
	Run: func(cmd *cobra.Command, args []string) {
		if Version == "dev" {
			if bi, ok := debug.ReadBuildInfo(); ok && bi != nil {
				if bi.Main.Version != "" && bi.Main.Version != "(devel)" {
					Version = bi.Main.Version
				}
			}
		}
		fmt.Printf("Version: %s\n", Version)
		fmt.Printf("Go:      %s %s/%s\n", runtime.Version(), runtime.GOOS, runtime.GOARCH)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
