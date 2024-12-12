package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	ENABLE_ESM_UPDATES             = false
	ENABLE_TESTING_LIBRARY_UPDATES = false

	MAX_WORKERS = 10
	MIN_WORKERS = 2
)

var (
	repoRoot = mustFindRepoRoot()
)

var (
	noop = errors.New("no work to do")
)

func main() {
	startTime := time.Now()
	numProcessed := 0
	numSkipped := 0
	numErrors := 0

	fileChannel := collectFiles()
	var waitGroup sync.WaitGroup

	processFiles := func(workerId int) {
		defer waitGroup.Done()

		for filename := range fileChannel {
			newContent, err := newVitestifyTask(filename).run()

			if errors.Is(err, noop) {
				numSkipped += 1
				continue
			}

			if err != nil {
				numErrors += 1
				fmt.Printf(
					"❌ [ worker %d ] %s: %v\n",
					workerId,
					filename,
					err,
				)
				continue
			}

			err = os.WriteFile(filename, []byte(newContent), 0644)
			if err != nil {
				numErrors += 1
				fmt.Printf(
					"❌ [ worker %d ] %s: %v\n",
					workerId,
					filename,
					err,
				)
				continue
			}

			numProcessed += 1
		}
	}

	workerCount := max(min(runtime.NumCPU()-2, MAX_WORKERS), MIN_WORKERS)
	for i := range workerCount {
		waitGroup.Add(1)
		go processFiles(i)
	}

	waitGroup.Wait()

	fmt.Println()
	fmt.Println("✅", time.Since(startTime))
	fmt.Println(numProcessed+numSkipped, "potential")
	fmt.Println(numProcessed, "processed")
	fmt.Println(numSkipped, "skipped")
	fmt.Println(numErrors, "error(s)")
}

func mustFindRepoRoot() string {
	pwd, err := os.Getwd()
	if err != nil {
		log.Fatalln("[ERROR] Unable to find working directory:", err)
	}

	cmdGitRoot := exec.Command("git", "rev-parse", "--show-toplevel")
	cmdGitRoot.Dir = pwd
	result, err := cmdGitRoot.Output()
	if err != nil {
		log.Fatalln("[ERROR] Unable to find git root dir:", err)
	}

	repoRoot := strings.TrimSpace(string(result))
	if !path.IsAbs(repoRoot) {
		log.Fatalln("[ERROR] Unexpected path format found for git root:", repoRoot)
	}

	return repoRoot
}
