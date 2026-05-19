package cmd

import (
	"fmt"
	"os"

	"github.com/aura-studio/dynamic-node-cli/clean"
	"github.com/aura-studio/dynamic-node-cli/config"
	"github.com/spf13/cobra"
)

var cleanCacheCmd = &cobra.Command{
	Use:     "cache",
	Short:   "Clean cache (keep .zip artifacts)",
	Long:    "Reads dynamic-node-cli.yaml, locates the output directory for the given procedure, and removes cached files while keeping .zip artifacts.",
	Example: "  dynamic-node clean cache -c ./dynamic-node-cli.yaml -p my-app\n",
	Args:    cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		cfgPath := resolveConfigPath(cmd)

		procName, err := cmd.Flags().GetString("procedure")
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}

		c := config.Parse(cfgPath)
		config.Validate(c)

		if procName == "" {
			fmt.Println("No procedure specified, cleaning cache for all procedures...")
			procedures := config.GetAllProcedures(c)
			for _, pName := range procedures {
				fmt.Printf("\nCleaning cache for procedure: %s\n", pName)
				proc := config.CreateProcedure(c, pName)
				clean.CleanForProcedure(proc, clean.CleanTypeCache)
			}
			fmt.Println("\nCache cleaned for all procedures.")
		} else {
			proc := config.CreateProcedure(c, procName)
			clean.CleanForProcedure(proc, clean.CleanTypeCache)
		}
	},
}

func init() {
	cleanCmd.AddCommand(cleanCacheCmd)
}
