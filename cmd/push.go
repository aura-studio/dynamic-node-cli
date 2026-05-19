package cmd

import (
	"fmt"
	"os"

	"github.com/aura-studio/dynamic-node-cli/config"
	"github.com/aura-studio/dynamic-node-cli/push"
	"github.com/spf13/cobra"
)

// pushCmd represents the push command.
var pushCmd = &cobra.Command{
	Use:   "push",
	Short: "Push build artifacts to S3 warehouse",
	Long:  `Reads dynamic-node-cli.yaml and the given --procedure, then pushes .zip artifacts to remote S3.`,
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
			fmt.Println("No procedure specified, pushing all procedures...")
			procedures := config.GetAllProcedures(c)
			for _, procName := range procedures {
				fmt.Printf("\nPushing procedure: %s\n", procName)
				procObj := config.CreateProcedure(c, procName)
				push.PushForProcedure(procObj)
			}
			fmt.Println("\nAll procedures pushed successfully.")
		} else {
			procObj := config.CreateProcedure(c, proc)
			push.PushForProcedure(procObj)
		}
	},
}

func init() {
	rootCmd.AddCommand(pushCmd)
	pushCmd.Flags().StringP("config", "c", "", "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml or ./dynamic-node-cli.yml)")
	pushCmd.Flags().StringP("procedure", "p", "", "procedure name to push (optional, pushes all if not specified)")
}
