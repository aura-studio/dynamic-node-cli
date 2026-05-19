package cmd

import (
	"fmt"
	"os"

	"github.com/aura-studio/dynamic-node-cli/clean"
	"github.com/aura-studio/dynamic-node-cli/config"
	"github.com/spf13/cobra"
)

var cleanAllCmd = &cobra.Command{
	Use:     "all",
	Short:   "Remove the entire warehouse",
	Long:    "Reads dynamic-node-cli.yaml and deletes all contents under warehouse.local.",
	Example: "  dynamic-node clean all -c ./dynamic-node-cli.yaml\n  dynamic-node clean all -c ./dynamic-node-cli.yaml -p my-app\n",
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
			procName = c.Procedures[0].Name
		}
		proc := config.CreateProcedure(c, procName)
		clean.CleanForProcedure(proc, clean.CleanTypeAll)
	},
}

func init() {
	cleanCmd.AddCommand(cleanAllCmd)
}
