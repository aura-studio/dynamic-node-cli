package cmd

import (
	"fmt"
	"os"

	"github.com/aura-studio/dynamic-node-cli/build"
	"github.com/aura-studio/dynamic-node-cli/config"
	"github.com/spf13/cobra"
)

// buildCmd represents the build command.
var buildCmd = &cobra.Command{
	Use:   "build",
	Short: "Build Node.js project into zip package",
	Long:  `Reads dynamic-node-cli.yaml and the given --procedure, then builds the Node.js project.`,
	Run: func(cmd *cobra.Command, args []string) {
		cfgPath := resolveConfigPath(cmd)

		proc, err := cmd.Flags().GetString("procedure")
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}

		c := config.Parse(cfgPath)
		config.Validate(c)

		if proc == "" {
			fmt.Println("No procedure specified, building all procedures...")
			procedures := config.GetAllProcedures(c)
			for _, procName := range procedures {
				fmt.Printf("\nBuilding procedure: %s\n", procName)
				procObj := config.CreateProcedure(c, procName)
				build.BuildForProcedure(procObj)
			}
			fmt.Println("\nAll procedures built successfully.")
		} else {
			procObj := config.CreateProcedure(c, proc)
			build.BuildForProcedure(procObj)
		}
	},
}

func init() {
	rootCmd.AddCommand(buildCmd)
	buildCmd.Flags().StringP("config", "c", "", "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml or ./dynamic-node-cli.yml)")
	buildCmd.Flags().StringP("procedure", "p", "", "procedure name to build (optional, builds all if not specified)")
}
