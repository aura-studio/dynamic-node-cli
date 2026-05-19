package build

import (
	"archive/zip"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/evanw/esbuild/pkg/api"
)

// RenderData holds all parameters needed for a build.
type RenderData struct {
	Name        string // e.g. "myteam_app_v1.0.0"
	SourcePath  string // e.g. "./src/app"
	Entry       string // e.g. "index.js"
	Version     string // source version tag
	House       string // warehouse local path
	Environment string // e.g. "ubuntu22.04_amd64v1_node22_bundle"
	Variant     string // "bundle" or "full"
	Dir         string // output dir: House/Environment/Name
	OS          string
	Arch        string
	Compiler    string
}

// Builder executes the build pipeline for a Node.js procedure.
type Builder struct {
	config *RenderData
}

// New creates a new Builder.
func New(c *RenderData) *Builder {
	return &Builder{config: c}
}

// Build executes the full build pipeline.
func (b *Builder) Build() {
	fmt.Println("start...")
	defer fmt.Println("done!")

	// Ensure output directory exists
	if err := os.MkdirAll(b.config.Dir, 0o755); err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}

	// Run npm install in source directory
	b.npmInstall()

	if b.config.Variant == "full" {
		b.buildFull()
	} else {
		b.buildBundle()
	}
}

// npmInstall runs `npm install` in the source directory.
func (b *Builder) npmInstall() {
	srcPath := b.resolveSourcePath()
	fmt.Printf("npm install in %s\n", srcPath)

	cmd := exec.Command("npm", "install")
	cmd.Dir = srcPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		fmt.Println("error: npm install failed:", err)
		os.Exit(1)
	}
}

// buildBundle uses esbuild Go API to bundle the entry file, then zips the result.
func (b *Builder) buildBundle() {
	srcPath := b.resolveSourcePath()
	entryPoint := filepath.Join(srcPath, b.config.Entry)

	fmt.Printf("esbuild bundle %s\n", entryPoint)

	result := api.Build(api.BuildOptions{
		EntryPoints: []string{entryPoint},
		Bundle:      true,
		Outfile:     filepath.Join(b.config.Dir, "bundle.js"),
		Platform:    api.PlatformNode,
		Format:      api.FormatCommonJS,
		Write:       true,
		LogLevel:    api.LogLevelInfo,
	})

	if len(result.Errors) > 0 {
		fmt.Println("esbuild errors:")
		for _, msg := range result.Errors {
			fmt.Printf("  %s\n", msg.Text)
		}
		os.Exit(1)
	}

	// Create zip archive
	zipName := fmt.Sprintf("libnode_%s.zip", b.config.Name)
	zipPath := filepath.Join(b.config.Dir, zipName)
	b.createBundleZip(zipPath)

	// Create timestamped backup
	backupPath := zipPath + "." + time.Now().UTC().Format("2006-01-02T150405Z")
	b.copyFile(zipPath, backupPath)

	fmt.Printf("output: %s\n", zipPath)
}

// buildFull packages the entire project directory (with node_modules) into a zip.
func (b *Builder) buildFull() {
	srcPath := b.resolveSourcePath()

	zipName := fmt.Sprintf("libnode_%s.zip", b.config.Name)
	zipPath := filepath.Join(b.config.Dir, zipName)

	fmt.Printf("full zip %s -> %s\n", srcPath, zipPath)
	b.createFullZip(zipPath, srcPath)

	// Create timestamped backup
	backupPath := zipPath + "." + time.Now().UTC().Format("2006-01-02T150405Z")
	b.copyFile(zipPath, backupPath)

	fmt.Printf("output: %s\n", zipPath)
}

// resolveSourcePath resolves the source path (supports relative and absolute paths).
func (b *Builder) resolveSourcePath() string {
	srcPath := b.config.SourcePath
	if !filepath.IsAbs(srcPath) {
		cwd, err := os.Getwd()
		if err != nil {
			fmt.Println("error:", err)
			os.Exit(1)
		}
		srcPath = filepath.Join(cwd, srcPath)
	}
	return srcPath
}

// createBundleZip creates a zip containing only bundle.js.
func (b *Builder) createBundleZip(zipPath string) {
	bundlePath := filepath.Join(b.config.Dir, "bundle.js")

	f, err := os.Create(zipPath)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	b.addFileToZip(w, bundlePath, "bundle.js")
}

// createFullZip creates a zip of the entire project directory.
func (b *Builder) createFullZip(zipPath string, srcDir string) {
	f, err := os.Create(zipPath)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	err = filepath.WalkDir(srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Skip .git directory
		if d.IsDir() && d.Name() == ".git" {
			return filepath.SkipDir
		}

		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}

		if d.IsDir() {
			// Create directory entry in zip
			_, err := w.Create(rel + "/")
			return err
		}

		b.addFileToZip(w, path, rel)
		return nil
	})
	if err != nil {
		fmt.Println("error creating zip:", err)
		os.Exit(1)
	}
}

// addFileToZip adds a single file to a zip writer.
func (b *Builder) addFileToZip(w *zip.Writer, filePath string, name string) {
	// Use forward slashes in zip
	name = strings.ReplaceAll(name, string(os.PathSeparator), "/")

	src, err := os.Open(filePath)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	defer src.Close()

	info, err := src.Stat()
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	header.Name = name
	header.Method = zip.Deflate

	dst, err := w.CreateHeader(header)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}

	if _, err := io.Copy(dst, src); err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
}

// copyFile copies a file from src to dst.
func (b *Builder) copyFile(src, dst string) {
	in, err := os.Open(src)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		fmt.Println("error:", err)
		os.Exit(1)
	}
}
