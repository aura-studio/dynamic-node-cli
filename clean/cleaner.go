package clean

import (
	"log"
	"os"
	"path/filepath"
	"strings"
)

// CleanType represents the type of clean operation.
type CleanType int

const (
	CleanTypeCache   CleanType = iota // Remove non-.zip files, keep .zip artifacts
	CleanTypePackage                  // Remove .zip artifacts and their backups
	CleanTypeAll                      // Remove the entire warehouse
	CleanTypeUseless                  // Remove all files except .zip without date suffix
)

// Cleaner performs clean operations.
type Cleaner struct {
	*PathList
}

// New creates a new Cleaner.
func New(pathList *PathList) *Cleaner {
	return &Cleaner{
		PathList: pathList,
	}
}

// Clean dispatches to the appropriate clean method.
func (c *Cleaner) Clean(cleanType CleanType) {
	switch cleanType {
	case CleanTypeCache:
		c.cleanCache()
	case CleanTypePackage:
		c.cleanPackage()
	case CleanTypeAll:
		c.cleanAll()
	case CleanTypeUseless:
		c.cleanUseless()
	default:
		log.Panicf("clean type not found: %d", cleanType)
	}
}

// cleanAll removes all contents under the warehouse directory.
func (c *Cleaner) cleanAll() {
	if _, err := os.Stat(c.WareHouse); err != nil {
		if os.IsNotExist(err) {
			return
		} else {
			log.Panic(err)
		}
	} else {
		entries, err := os.ReadDir(c.WareHouse)
		if err != nil {
			log.Panic(err)
		}
		for _, file := range entries {
			p := filepath.Join(c.WareHouse, file.Name())
			log.Printf("clean remove %s", p)
			if file.IsDir() {
				if err := os.RemoveAll(p); err != nil {
					log.Panic(err)
				}
			} else {
				if err := os.Remove(p); err != nil {
					log.Panic(err)
				}
			}
		}
	}
}

// cleanPackage removes all .zip files and their date-suffixed backups.
func (c *Cleaner) cleanPackage() {
	if _, err := os.Stat(c.WareHouse); err == nil {
		if err := filepath.Walk(c.WareHouse, func(path string, info os.FileInfo, err error) error {
			if path == c.WareHouse || info.IsDir() {
				return nil
			}
			name := strings.ToLower(info.Name())
			if strings.Contains(name, ".zip") {
				log.Printf("clean remove artifact %s", path)
				if err := os.Remove(path); err != nil {
					log.Panic(err)
				}
			}
			return nil
		}); err != nil {
			log.Panic(err)
		}
	}
}

// cleanCache removes everything except .zip files and their date-suffixed backups.
func (c *Cleaner) cleanCache() {
	if _, err := os.Stat(c.WareHouse); err != nil {
		if os.IsNotExist(err) {
			return
		} else {
			log.Panic(err)
		}
	} else {
		if err := filepath.Walk(c.WareHouse, func(path string, info os.FileInfo, err error) error {
			if path == c.WareHouse || info.IsDir() {
				return nil
			}
			name := strings.ToLower(info.Name())
			if strings.Contains(name, ".zip") {
				return nil
			}
			log.Printf("clean remove non-artifact %s", path)
			if err := os.Remove(path); err != nil {
				log.Panic(err)
			}
			return nil
		}); err != nil {
			log.Panic(err)
		}
	}
}

// cleanUseless removes all files except clean .zip files (without date suffix).
func (c *Cleaner) cleanUseless() {
	if _, err := os.Stat(c.WareHouse); err != nil {
		if os.IsNotExist(err) {
			return
		} else {
			log.Panic(err)
		}
	} else {
		if err := filepath.Walk(c.WareHouse, func(path string, info os.FileInfo, err error) error {
			if path == c.WareHouse || info.IsDir() {
				return nil
			}
			name := strings.ToLower(info.Name())
			ext := filepath.Ext(name)
			// Keep only .zip files without date suffix
			if ext == ".zip" {
				return nil
			}
			log.Printf("clean remove %s", path)
			if err := os.Remove(path); err != nil {
				log.Panic(err)
			}
			return nil
		}); err != nil {
			log.Panic(err)
		}
	}
}
