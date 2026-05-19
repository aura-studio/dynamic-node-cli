package toolchain

import "github.com/aura-studio/dynamic-node-cli/env"

// Values holds the expected toolchain field values.
type Values struct {
	OS       string
	Arch     string
	Compiler string
}

// Detect returns the current OS/Arch/Compiler values detected from the local machine.
func Detect() Values {
	return Values{
		OS:       env.GetOS(),
		Arch:     env.GetArch(),
		Compiler: env.GetCompiler(),
	}
}

// Kind represents a toolchain field type.
type Kind string

const (
	KindOS       Kind = "os"
	KindArch     Kind = "arch"
	KindCompiler Kind = "compiler"
)

// Describe returns the current value of the requested toolchain field.
func Describe(kind Kind) string {
	switch kind {
	case KindOS:
		return env.GetOS()
	case KindArch:
		return env.GetArch()
	case KindCompiler:
		return env.GetCompiler()
	default:
		return ""
	}
}

// Check validates OS/Arch/Compiler together.
// It prints per-field pass/fail messages (delegated to env.Check*).
func Check(expected Values) bool {
	ok := true
	ok = env.CheckOS(expected.OS) && ok
	ok = env.CheckArch(expected.Arch) && ok
	ok = env.CheckCompiler(expected.Compiler) && ok
	return ok
}
