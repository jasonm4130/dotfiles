// claude-hooks — one compiled binary for the hot-path Claude Code hooks.
//
// A hook is spawned per tool call, so the cost that matters is process start,
// not the work. On this machine a bare node startup is ~20ms while the hook
// logic itself is ~2ms, which is the whole reason this exists.
//
// Dispatch is by argv[1] so a single binary replaces several hooks and pays
// the build cost once.
//
//	claude-hooks secrets-scan   PreToolUse   Edit|Write|MultiEdit|NotebookEdit|Bash
//
// `lsp-first` used to live here too. It moved to the `gates` plugin in the
// claude-skills repo, which is where distributable capability belongs; this
// binary keeps only `secrets-scan`, the one guard that fails CLOSED and so
// cannot tolerate a plugin's silent fail-open loading paths.
//
// Unlike the `ccguard` pilot in the claude-skills repo, this binary is built
// from source by chezmoi at apply time rather than committed. There is no
// shipped artifact, so there is no staleness hazard and no source fingerprint
// to maintain.
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: claude-hooks <secrets-scan>")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "secrets-scan":
		secretsScan()
	default:
		fmt.Fprintf(os.Stderr, "unknown hook %q\n", os.Args[1])
		os.Exit(2)
	}
}
