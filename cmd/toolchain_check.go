package cmd

import (
	"fmt"
	"os"

	"github.com/aura-studio/dynamic-node-cli/config"
	"github.com/aura-studio/dynamic-node-cli/toolchain"
	"github.com/spf13/cobra"
)

var toolchainCheckCmd = &cobra.Command{
	Use:     "check",
	Short:   "Check OS / Arch / Compiler in one run",
	Long:    "Reads environment.toolchain from dynamic-node-cli.yaml for the given procedure and checks OS/Arch/Compiler. Exits with code 1 on any mismatch.",
	Example: "  dynamic-node toolchain check -c ./dynamic-node-cli.yaml -p my-app\n",
	Args:    cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		cfgPath := resolveConfigPath(cmd)

		procName, err := cmd.Flags().GetString("procedure")
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}
		if procName == "" {
			fmt.Println("error: procedure is required")
			os.Exit(1)
		}

		c := config.Parse(cfgPath)
		config.Validate(c)
		proc := config.CreateProcedure(c, procName)

		expected := toolchain.Values{
			OS:       proc.Toolchain.OS,
			Arch:     proc.Toolchain.Arch,
			Compiler: proc.Toolchain.Compiler,
		}
		if ok := toolchain.Check(expected); !ok {
			os.Exit(1)
		}
	},
}

func init() {
	toolchainCmd.AddCommand(toolchainCheckCmd)
	toolchainCheckCmd.Flags().StringP("config", "c", "", "path to dynamic-node-cli.yaml (default: ./dynamic-node-cli.yaml if exists)")
	toolchainCheckCmd.Flags().StringP("procedure", "p", "", "procedure name to check (required)")
}
