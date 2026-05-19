package env

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"unicode"
)

// GetOS returns a best-effort OS descriptor.
// - On Linux with /etc/os-release: "<id><version_id>" like "ubuntu22.04".
// - On macOS: "darwin<version>" like "darwin14.2.1".
// - On Windows: "windows<version>".
// - Fallback: returns GOOS like "linux"/"darwin"/"windows".
func GetOS() string {
	goos := strings.ToLower(strings.TrimSpace(runtime.GOOS))

	switch goos {
	case "linux":
		if desc := detectLinuxDescriptor(); desc != "" {
			return desc
		}
		return "linux"
	case "windows":
		if v := detectWindowsVersion(); v != "" {
			return "windows" + v
		}
		return "windows"
	case "darwin":
		if v := detectDarwinVersion(); v != "" {
			return "darwin" + v
		}
		return "darwin"
	default:
		return goos
	}
}

func detectLinuxDescriptor() string {
	f, err := os.Open("/etc/os-release")
	if err != nil {
		return ""
	}
	defer f.Close()

	m := map[string]string{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		m[k] = strings.Trim(v, `"`)
	}
	id := strings.ToLower(strings.TrimSpace(m["ID"]))
	ver := strings.TrimSpace(m["VERSION_ID"])
	if id == "" || ver == "" {
		return ""
	}
	return id + strings.TrimSpace(ver)
}

func detectWindowsVersion() string {
	out, err := exec.Command(
		"powershell",
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		"[System.Environment]::OSVersion.Version.ToString()",
	).Output()
	if err == nil {
		v := strings.TrimSpace(string(out))
		if v != "" {
			return v
		}
	}

	out, err = exec.Command("cmd", "/c", "ver").Output()
	if err != nil {
		return ""
	}
	return extractFirstVersionLikeToken(string(out))
}

func detectDarwinVersion() string {
	out, err := exec.Command("sw_vers", "-productVersion").Output()
	if err == nil {
		v := strings.TrimSpace(string(out))
		if v != "" {
			return v
		}
	}
	out, err = exec.Command("uname", "-r").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func extractFirstVersionLikeToken(s string) string {
	s = strings.TrimSpace(s)
	start := -1
	for i, r := range s {
		if unicode.IsDigit(r) {
			start = i
			break
		}
	}
	if start < 0 {
		return ""
	}
	end := start
	for end < len(s) {
		c := s[end]
		if (c >= '0' && c <= '9') || c == '.' {
			end++
			continue
		}
		break
	}
	if end <= start {
		return ""
	}
	return s[start:end]
}

// GetArch returns current arch with best-effort variant.
// Examples: amd64v1, armv7, arm64v8.
func GetArch() string {
	env, ok := getGoEnvArchVars()
	if ok {
		goarch := strings.ToLower(strings.TrimSpace(env.GOARCH))
		switch goarch {
		case "":
			// fall through to runtime below
		case "amd64":
			goamd64 := strings.ToLower(strings.TrimSpace(env.GOAMD64))
			if strings.HasPrefix(goamd64, "v") {
				return "amd64" + goamd64
			} else {
				fmt.Printf("unexpected GOAMD64 value: %q\n", goamd64)
			}
			return "amd64"
		case "arm":
			goarm := strings.TrimSpace(env.GOARM)
			if goarm != "" {
				return "armv" + goarm
			} else {
				fmt.Println("unexpected GOARM empty value")
			}
			return "arm"
		case "arm64":
			return "arm64v8"
		default:
			return goarch
		}
	}

	goarch := strings.ToLower(strings.TrimSpace(runtime.GOARCH))
	if goarch == "arm64" {
		return "arm64v8"
	}
	return goarch
}

type goEnvArchVars struct {
	GOARCH  string `json:"GOARCH"`
	GOAMD64 string `json:"GOAMD64"`
	GOARM   string `json:"GOARM"`
}

func getGoEnvArchVars() (goEnvArchVars, bool) {
	out, err := exec.Command("go", "env", "-json").Output()
	if err != nil {
		return goEnvArchVars{}, false
	}
	var v goEnvArchVars
	if err := json.Unmarshal(out, &v); err != nil {
		return goEnvArchVars{}, false
	}
	return v, true
}

// GetCompiler returns the Node.js version string.
// Format: "node<major>" (e.g. "node22") from the installed `node --version`.
func GetCompiler() string {
	out, err := exec.Command("node", "--version").Output()
	if err != nil {
		return ""
	}
	// node --version returns something like "v22.11.0"
	ver := strings.TrimSpace(string(out))
	ver = strings.TrimPrefix(ver, "v")
	if ver == "" {
		return ""
	}
	return "node" + ver
}

// GetCompilerMajor returns the Node.js major version string.
// Format: "node<major>" (e.g. "node22").
func GetCompilerMajor() string {
	out, err := exec.Command("node", "--version").Output()
	if err != nil {
		return ""
	}
	ver := strings.TrimSpace(string(out))
	ver = strings.TrimPrefix(ver, "v")
	if ver == "" {
		return ""
	}
	parts := strings.SplitN(ver, ".", 2)
	return "node" + parts[0]
}
