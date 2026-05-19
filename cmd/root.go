package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

// rootCmd represents the base command when called without any subcommands.
var rootCmd = &cobra.Command{
	Use:   "dynamic-node",
	Short: "dynamic-node build tool",
	Long:  "dynamic-node is a CLI driven by dynamic-node-cli.yaml for build/push/pull/clean and toolchain utilities for Node.js projects.",
}

// Execute adds all child commands to the root command and sets flags appropriately.
func Execute() {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
}

func init() {
}
