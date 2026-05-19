package cmd

import (
	"fmt"
	"os"

	"github.com/aura-studio/dynamic-node-cli/config"
	"github.com/aura-studio/dynamic-node-cli/pull"
	"github.com/spf13/cobra"
)

// pullCmd represents the pull command.
var pullCmd = &cobra.Command{
	Use:   "pull",
	Short: "Pull artifacts from S3 warehouse to local",
	Long:  "Reads dynamic-node-cli.yaml and the given --procedure, then pulls .zip artifacts from remote(s) to local warehouse.",
	Run: func(cmd *cobra.Command, args []string) {
		cfgPath := resolveConfigPath(cmd)

		proc, err := cmd.Flags().GetString("procedure")
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}
		concurrency, err := cmd.Flags().GetInt("concurrency")
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}
		force, err := cmd.Flags().GetBool("force")
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}
		remote, err := cmd.Flags().GetString("remote")
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}

		c := config.Parse(cfgPath)
		config.Validate(c)

		opt := pull.Options{Concurrency: concurrency, Force: force, Remote: remote}

		if proc == "" {
			fmt.Println("No procedure specified, pulling all procedures...")
			procedures := config.GetAllProcedures(c)
			for _, procName := range procedures {
				fmt.Printf("\nPulling procedure: %s\n", procName)
				procObj := config.CreateProcedure(c, procName)
				pull.PullForProcedure(procObj, opt)
			}
			fmt.Println("\nAll procedures pulled successfully.")
			return
		}

		procObj := config.CreateProcedure(c, proc)
		pull.PullForProcedure(procObj, opt)
	},
}

func init() {
	rootCmd.AddCommand(pullCmd)
	pullCmd.Flags().StringP("config", "c", "", "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml or ./dynamic-node-cli.yml)")
	pullCmd.Flags().StringP("procedure", "p", "", "procedure name to pull (optional, pulls all if not specified)")
	pullCmd.Flags().IntP("concurrency", "j", 8, "max concurrent downloads per remote")
	pullCmd.Flags().BoolP("force", "f", false, "overwrite existing local files")
	pullCmd.Flags().String("remote", "", "override warehouse.remote (pull from this remote only)")
}
