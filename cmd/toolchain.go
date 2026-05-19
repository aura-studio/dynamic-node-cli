package cmd

import "github.com/spf13/cobra"

// toolchainCmd groups toolchain-related subcommands.
var toolchainCmd = &cobra.Command{
	Use:   "toolchain",
	Short: "Toolchain utilities",
	Long:  "Provides toolchain check and describe utilities for Node.js environments.",
}

func init() {
	rootCmd.AddCommand(toolchainCmd)
}
