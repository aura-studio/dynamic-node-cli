package config

import (
	"fmt"
	"os"
	"regexp"

	"gopkg.in/yaml.v3"
)

// Config is the top-level configuration for dynamic-node-cli.
// It mirrors dynamic-cli's structure, adapted for Node.js projects.
type Config struct {
	Environments []struct {
		Name      string `yaml:"name"`
		Toolchain struct {
			OS       string `yaml:"os"`
			Arch     string `yaml:"arch"`
			Compiler string `yaml:"compiler"` // e.g. "node22", "node22.11.0"
			Variant  string `yaml:"variant"`  // "bundle" or "full"
		} `yaml:"toolchain"`
		Warehouse struct {
			Local  string   `yaml:"local"`
			Remote []string `yaml:"remote"`
		} `yaml:"warehouse"`
	} `yaml:"environments"`

	Procedures []struct {
		Name        string `yaml:"name"`
		Environment string `yaml:"environment"`
		Source      struct {
			Path    string `yaml:"path"`    // local path to node project
			Entry   string `yaml:"entry"`   // entry point (e.g. "index.js", "src/main.js")
			Version string `yaml:"version"` // version tag
		} `yaml:"source"`
		Target struct {
			Namespace string `yaml:"namespace"`
			Package   string `yaml:"package"`
			Version   string `yaml:"version"`
		} `yaml:"target"`
	} `yaml:"procedures"`
}

// Parse reads the given YAML file and returns Config.
func Parse(file string) Config {
	data, err := os.ReadFile(file)
	if err != nil {
		panic(err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		panic(err)
	}
	return config
}

// Validate checks Config fields and panics on failures.
// Rules:
// 1. All fields must be non-empty.
// 2. Each procedure.environment must exist in environments names.
// 3. Toolchain fields (os, arch, compiler, variant) must match ^[A-Za-z0-9._-]+$.
// 4. Target values (namespace, package, version) must match ^[A-Za-z0-9._-]+$.
func Validate(c Config) {
	allowed := regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

	envNames := map[string]struct{}{}
	if len(c.Environments) == 0 {
		panic("config: environments must not be empty")
	}
	for i, env := range c.Environments {
		if env.Name == "" {
			panic(fmt.Sprintf("config: environments[%d].name must not be empty", i))
		}
		if env.Toolchain.OS == "" || env.Toolchain.Arch == "" || env.Toolchain.Compiler == "" || env.Toolchain.Variant == "" {
			panic(fmt.Sprintf("config: environments[%d] toolchain fields must not be empty", i))
		}
		if !allowed.MatchString(env.Toolchain.OS) || !allowed.MatchString(env.Toolchain.Arch) || !allowed.MatchString(env.Toolchain.Compiler) || !allowed.MatchString(env.Toolchain.Variant) {
			panic(fmt.Sprintf("config: environments[%d].toolchain fields contain invalid characters", i))
		}
		if env.Toolchain.Variant != "bundle" && env.Toolchain.Variant != "full" {
			panic(fmt.Sprintf("config: environments[%d].toolchain.variant must be 'bundle' or 'full'", i))
		}
		if env.Warehouse.Local == "" {
			panic(fmt.Sprintf("config: environments[%d].warehouse.local must not be empty", i))
		}
		if len(env.Warehouse.Remote) == 0 {
			panic(fmt.Sprintf("config: environments[%d].warehouse.remote must not be empty", i))
		}
		for j, r := range env.Warehouse.Remote {
			if r == "" {
				panic(fmt.Sprintf("config: environments[%d].warehouse.remote[%d] must not be empty", i, j))
			}
		}
		envNames[env.Name] = struct{}{}
	}

	if len(c.Procedures) == 0 {
		panic("config: procedures must not be empty")
	}
	for i, p := range c.Procedures {
		if p.Name == "" {
			panic(fmt.Sprintf("config: procedures[%d].name must not be empty", i))
		}
		if p.Environment == "" {
			panic(fmt.Sprintf("config: procedures[%d].environment must not be empty", i))
		}
		if _, ok := envNames[p.Environment]; !ok {
			panic(fmt.Sprintf("config: procedures[%d].environment not found in environments", i))
		}
		// source
		if p.Source.Path == "" || p.Source.Entry == "" || p.Source.Version == "" {
			panic(fmt.Sprintf("config: procedures[%d] source fields must not be empty", i))
		}
		// target
		if p.Target.Namespace == "" || p.Target.Package == "" || p.Target.Version == "" {
			panic(fmt.Sprintf("config: procedures[%d] target fields must not be empty", i))
		}
		if !allowed.MatchString(p.Target.Namespace) {
			panic(fmt.Sprintf("config: procedures[%d].target.namespace contains invalid characters", i))
		}
		if !allowed.MatchString(p.Target.Package) {
			panic(fmt.Sprintf("config: procedures[%d].target.package contains invalid characters", i))
		}
		if !allowed.MatchString(p.Target.Version) {
			panic(fmt.Sprintf("config: procedures[%d].target.version contains invalid characters", i))
		}
	}
}
