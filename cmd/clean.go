package cmd

import (
	"github.com/spf13/cobra"
)

// cleanCmd represents the clean command.
var cleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Clean build artifacts",
	Long:  "Cleans build artifacts under the warehouse. Subcommands: cache/package/all/useless.",
}

func init() {
	rootCmd.AddCommand(cleanCmd)
	cleanCmd.PersistentFlags().StringP("config", "c", "", "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml or ./dynamic-node-cli.yml)")
	cleanCmd.PersistentFlags().StringP("procedure", "p", "", "procedure name to select warehouse (optional)")
}
