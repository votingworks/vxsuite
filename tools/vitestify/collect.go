package main

import (
	"io/fs"
	"log"
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

var (
	srcExtensions = []string{
		".ts",
		".tsx",
	}
	srcDirs = []string{
		repoRoot + "/apps",
		repoRoot + "/libs",
		repoRoot + "/script",
	}
	skipDirs = []string{
		"__image_snapshots__",
		"__snapshots__",
		"*-snapshots",
		"build",
		"integration-testing",
		"node_modules",
		"public",
		"target",
	}
	skipPaths = []string{
		repoRoot + "/libs/auth/certs",
		repoRoot + "/libs/ballot-interpreter/test/fixtures",
		repoRoot + "/libs/fixtures/data",
	}

	regexTestUtilFilePath = regexp.MustCompile(
		`(` +
			strings.Join([]string{
				`[_-]test[_-]`,
				`/test[_-]`,
				`/test/`,
				`benchmark`,
				`castVoteRecords.ts`,
				`helper`,
				`mocks?`,
				`tmp.ts`,
				`utils?/`,
				`utils?.ts`,
			}, "|") +
			`)`,
	)
)

func collectFiles() chan string {
	chanFiles := make(chan string)

	go func() {
		err := filepath.WalkDir(
			repoRoot,
			func(filename string, entry fs.DirEntry, err error) error {
				if err != nil {
					log.Fatalln("error walking repo dir tree:", err)
				}

				if filename == repoRoot {
					return nil
				}

				basename := entry.Name()
				matchesBasename := func(nameOrGlob string) bool {
					matched, err := filepath.Match(nameOrGlob, basename)
					if err != nil {
						log.Fatalln("unable to match basename", nameOrGlob, err)
					}

					return matched
				}

				isCurrentPathPrefix := func(prefix string) bool {
					return strings.HasPrefix(filename, prefix)
				}

				if entry.IsDir() {
					if !slices.ContainsFunc(srcDirs, isCurrentPathPrefix) ||
						slices.ContainsFunc(skipDirs, matchesBasename) {
						return filepath.SkipDir
					}

					if !ENABLE_ESM_UPDATES &&
						slices.ContainsFunc(skipPaths, isCurrentPathPrefix) {
						return filepath.SkipDir
					}
				}

				if entry.IsDir() {
					return nil
				}

				if !slices.Contains(srcExtensions, path.Ext(basename)) ||
					strings.HasSuffix(basename, ".d.ts") {
					return nil
				}

				if !ENABLE_ESM_UPDATES &&
					!isTestFile(basename) &&
					!isMaybeTestUtil(filename) {
					return nil
				}

				chanFiles <- filename

				return nil
			},
		)

		if err != nil {
			log.Fatalln("error walking repo dir tree:", err)
		}

		close(chanFiles)
	}()

	return chanFiles
}

func isTestFile(filename string) bool {
	extension := path.Ext(filename)
	return strings.HasSuffix(filename, ".test"+extension)
}

func isMaybeTestUtil(filename string) bool {
	return regexTestUtilFilePath.MatchString(filename)
}
