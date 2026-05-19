package config

// GetAllProcedures returns all procedure names from the config.
func GetAllProcedures(c Config) []string {
	var names []string
	for _, p := range c.Procedures {
		names = append(names, p.Name)
	}
	return names
}

// Procedure is a flattened view of a single procedure with its resolved environment.
type Procedure struct {
	Toolchain struct {
		OS       string
		Arch     string
		Compiler string
		Variant  string
	}
	Warehouse struct {
		Local  string
		Remote []string
	}
	Source struct {
		Path    string
		Entry   string
		Version string
	}
	Target struct {
		Namespace string
		Package   string
		Version   string
	}
}

// CreateProcedure constructs a Procedure object from Config by procedure name.
func CreateProcedure(c Config, procedureName string) Procedure {
	if procedureName == "" {
		panic("procedure: procedure name must not be empty")
	}
	pIdx := -1
	for i, p := range c.Procedures {
		if p.Name == procedureName {
			pIdx = i
			break
		}
	}
	if pIdx < 0 {
		panic("procedure: procedure '" + procedureName + "' not found")
	}
	p := c.Procedures[pIdx]

	eIdx := -1
	for i, e := range c.Environments {
		if e.Name == p.Environment {
			eIdx = i
			break
		}
	}
	if eIdx < 0 {
		panic("procedure: environment '" + p.Environment + "' not found for procedure '" + procedureName + "'")
	}
	e := c.Environments[eIdx]

	var proc Procedure
	proc.Toolchain.OS = e.Toolchain.OS
	proc.Toolchain.Arch = e.Toolchain.Arch
	proc.Toolchain.Compiler = e.Toolchain.Compiler
	proc.Toolchain.Variant = e.Toolchain.Variant
	proc.Warehouse.Local = e.Warehouse.Local
	proc.Warehouse.Remote = append(proc.Warehouse.Remote, e.Warehouse.Remote...)
	proc.Source.Path = p.Source.Path
	proc.Source.Entry = p.Source.Entry
	proc.Source.Version = p.Source.Version
	proc.Target.Namespace = p.Target.Namespace
	proc.Target.Package = p.Target.Package
	proc.Target.Version = p.Target.Version
	return proc
}
