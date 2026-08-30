package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// The PreToolUse payload shape, shared by every subcommand. Fields absent from
// a given tool's input simply stay zero.
type payload struct {
	ToolName  string    `json:"tool_name"`
	CWD       string    `json:"cwd"`
	ToolInput toolInput `json:"tool_input"`
}

type toolInput struct {
	Content   string `json:"content"`    // Write
	NewString string `json:"new_string"` // Edit
	NewSource string `json:"new_source"` // NotebookEdit
	Command   string `json:"command"`    // Bash
	FilePath  string `json:"file_path"`  // Edit/Write/MultiEdit
	Pattern   string `json:"pattern"`    // Grep
	Glob      string `json:"glob"`       // Grep
	Path      string `json:"path"`       // Grep
	Type      string `json:"type"`       // Grep
	Edits     []struct {
		NewString string `json:"new_string"`
	} `json:"edits"` // MultiEdit
}

// Why the payload could not be used. The three cases are kept apart because
// the secrets-scan reason text names which one happened, and a user reading a
// blocked write needs to know whether the harness or their input was at fault.
type readFailure int

const (
	readOK readFailure = iota
	readUnreadable
	readUnparseable
	readNotAnObject
)

// readPayload returns the parsed stdin payload. Each caller decides whether a
// failure means fail open or fail closed, because the answer differs by hook.
func readPayload() (p payload, why readFailure) {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		return p, readUnreadable
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return p, readUnreadable
	}
	// A non-object payload (`null`, a bare string, an array) must be rejected,
	// not silently accepted as an empty struct. Unmarshalling `null` into a
	// struct succeeds and leaves every field zero, which would make
	// secrets-scan exit 0 on input it never scanned — a fail-open in a hook
	// whose whole contract is to fail closed.
	var any_ any
	if err := json.Unmarshal(raw, &any_); err != nil {
		return p, readUnparseable
	}
	if _, isObject := any_.(map[string]any); !isObject {
		return p, readNotAnObject
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return p, readUnparseable
	}
	return p, readOK
}

// deny emits the current PreToolUse deny contract and exits 0. The older
// top-level `decision: "block"` field is deprecated, and exit-code-2 blocking
// is unreliable for Edit/Write tool calls.
//
// SetEscapeHTML(false): the default encoder rewrites < and > as </>,
// which mangles the "<REDACTED>" placeholder the secrets-scan reason text tells
// the user to type. These reasons are read by a human, not embedded in HTML.
func deny(hookName, reason string) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	err := enc.Encode(map[string]any{
		"hookSpecificOutput": map[string]any{
			"hookEventName":            "PreToolUse",
			"permissionDecision":       "deny",
			"permissionDecisionReason": reason,
		},
	})
	if err != nil {
		// Encoding our own map cannot realistically fail, but a guard that
		// silently stops guarding is the failure mode these hooks exist to avoid.
		fmt.Fprintf(os.Stderr, "%s: could not encode deny payload\n", hookName)
		os.Exit(2)
	}
	os.Exit(0)
}
