package env

import (
	"fmt"
	"os"
	"strings"
)

// CheckOS validates that the current OS matches the target.
func CheckOS(targetOS string) bool {
	if targetOS == "" {
		return true
	}

	actualOS := strings.ToLower(strings.TrimSpace(GetOS()))
	if actualOS == "" {
		warnf("cannot detect OS (target=%s)", targetOS)
		return false
	}

	expected := strings.ToLower(strings.TrimSpace(targetOS))
	if actualOS != expected {
		warnf("OS mismatch (target=%s actual=%s)", expected, actualOS)
		return false
	}
	okf("OS match (target=%s actual=%s)", expected, actualOS)
	return true
}

// CheckArch validates that the current architecture matches the target.
func CheckArch(targetArch string) bool {
	if targetArch == "" {
		return true
	}

	actual := GetArch()
	if actual == "" {
		warnf("cannot detect arch (target=%s)", targetArch)
		return false
	}

	expected := strings.ToLower(strings.TrimSpace(targetArch))
	actualLower := strings.ToLower(actual)

	if expected == actualLower {
		okf("ARCH match (target=%s actual=%s)", expected, actualLower)
		return true
	}
	warnf("ARCH mismatch (target=%s actual=%s)", expected, actualLower)
	return false
}

// CheckCompiler validates that the current Node.js version matches the target.
// Matching strategy:
// - "node22" -> major version check only
// - "node22.11.0" -> exact version match
func CheckCompiler(targetCompiler string) bool {
	if targetCompiler == "" {
		return true
	}

	// Determine if the target is major-only (e.g. "node22") or exact (e.g. "node22.11.0")
	if !strings.Contains(targetCompiler, ".") {
		// Major-only match: e.g. "node22"
		actual := GetCompilerMajor()
		if actual == "" {
			warnf("cannot detect Node.js version (target=%s)", targetCompiler)
			return false
		}
		expected := strings.TrimSpace(targetCompiler)
		if actual == expected {
			okf("COMPILER match (target=%s actual=%s)", expected, actual)
			return true
		}
		warnf("COMPILER mismatch (target=%s actual=%s)", expected, actual)
		return false
	}

	// Exact match: e.g. "node22.11.0"
	actual := GetCompiler()
	if actual == "" {
		warnf("cannot detect Node.js version (target=%s)", targetCompiler)
		return false
	}
	expected := strings.TrimSpace(targetCompiler)
	if actual == expected {
		okf("COMPILER match (target=%s actual=%s)", expected, actual)
		return true
	}
	warnf("COMPILER mismatch (target=%s actual=%s)", expected, actual)
	return false
}

func warnf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "fail: "+format+"\n", args...)
}

func okf(format string, args ...any) {
	fmt.Printf("pass: "+format+"\n", args...)
}
