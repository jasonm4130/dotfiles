package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// The hooks are tested end-to-end through the built binary rather than by
// calling the subcommand functions directly: every one of them ends in
// os.Exit, and the exit status is part of the contract Claude Code reads.
var binPath string

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "claude-hooks-test")
	if err != nil {
		panic(err)
	}
	binPath = filepath.Join(dir, "claude-hooks")
	out, err := exec.Command("go", "build", "-o", binPath, ".").CombinedOutput()
	if err != nil {
		panic("build failed: " + string(out))
	}
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}

type result struct {
	stdout string
	stderr string
	code   int
}

func run(t *testing.T, sub, payload string, env ...string) result {
	t.Helper()
	cmd := exec.Command(binPath, sub)
	cmd.Stdin = strings.NewReader(payload)
	if len(env) > 0 {
		cmd.Env = env
	}
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := 0
	if ee, ok := err.(*exec.ExitError); ok {
		code = ee.ExitCode()
	} else if err != nil {
		t.Fatalf("running %s: %v", sub, err)
	}
	return result{stdout.String(), stderr.String(), code}
}

func grep(pattern string, extra ...string) string {
	fields := []string{`"pattern":` + mustJSON(pattern)}
	for i := 0; i+1 < len(extra); i += 2 {
		fields = append(fields, mustJSON(extra[i])+":"+mustJSON(extra[i+1]))
	}
	return `{"tool_name":"Grep","tool_input":{` + strings.Join(fields, ",") + `}}`
}

func mustJSON(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	return string(b)
}

func assertDenies(t *testing.T, r result, label string) {
	t.Helper()
	if r.code != 0 {
		t.Fatalf("%s: expected exit 0, got %d (stderr: %s)", label, r.code, r.stderr)
	}
	if strings.TrimSpace(r.stdout) == "" {
		t.Fatalf("%s: expected deny JSON on stdout, got none", label)
	}
	var parsed struct {
		HookSpecificOutput struct {
			PermissionDecision string `json:"permissionDecision"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal([]byte(r.stdout), &parsed); err != nil {
		t.Fatalf("%s: stdout is not JSON: %v", label, err)
	}
	if parsed.HookSpecificOutput.PermissionDecision != "deny" {
		t.Fatalf("%s: expected permissionDecision=deny, got %q", label, parsed.HookSpecificOutput.PermissionDecision)
	}
}

func assertAllows(t *testing.T, r result, label string) {
	t.Helper()
	if r.code != 0 {
		t.Fatalf("%s: expected exit 0, got %d (stderr: %s)", label, r.code, r.stderr)
	}
	if strings.TrimSpace(r.stdout) != "" {
		t.Fatalf("%s: expected no stdout, got %q", label, r.stdout)
	}
}

// ── lsp-first ────────────────────────────────────────────────────────────────

func TestLSPFirstBlocks(t *testing.T) {
	cases := []struct{ label, pattern string }{
		{"camelCase", "handleSubmit"},
		{"normalized trailing \\b", `getUserData\b`},
		{"normalized escaped paren", `fetchData\(`},
		{"PascalCase", "UserService"},
		{"snake_case", "fetch_user_data"},
		{"message-like error rule: fetch_failed_rows", "fetch_failed_rows"},
		{"message-like error rule: handleError", "handleError"},
		{"message-like error rule: ErrorBoundary", "ErrorBoundary"},
		{"message-like error rule: ValidationException", "ValidationException"},
		{"mixed-case dotted: this.handleSubmit", "this.handleSubmit"},
		{"mixed-case dotted: React.Component", "React.Component"},
		{"Pascal_Snake", "User_Model"},
		{"case-sensitive TODO prefix: warnUser", "warnUser"},
		{"case-sensitive TODO prefix: NoteEditor", "NoteEditor"},
		{"decorator", "@Component"},
		{"declaration keyword", "class UserService"},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			assertDenies(t, run(t, "lsp-first", grep(c.pattern)), c.label)
		})
	}
	t.Run("end-anchored ext does not disable the guard", func(t *testing.T) {
		r := run(t, "lsp-first", grep("handleSubmit", "path", "/x/work.log-analyzer/src"))
		assertDenies(t, r, "work.log-analyzer path")
	})
}

func TestLSPFirstPasses(t *testing.T) {
	cases := []struct{ label, pattern string }{
		{"TODO", "TODO"},
		{"FIXME:", "FIXME:"},
		{"string-literal allow rule", `"handleSubmit"`},
		{"escape hatch", "handleSubmit(?:)"},
		{"escape hatch on function-call pattern", `fetchData\((?:)`},
		{"env var", "MAX_RETRIES"},
		{"dotted config key", "foo.bar-baz"},
		{"dotted config key 2", "server.port"},
		{"short", "db"},
		{"message-like: Failed to connect", "Failed to connect"},
		{"message-like: error: connection refused", "error: connection refused"},
		{"url", "https://example.com"},
		{"version", "1.2.3"},
		{"import", "import React"},
		{"css class", ".btn-primary"},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			assertAllows(t, run(t, "lsp-first", grep(c.pattern)), c.label)
		})
	}
	t.Run("glob *.md", func(t *testing.T) {
		assertAllows(t, run(t, "lsp-first", grep("handleSubmit", "glob", "*.md")), "glob md")
	})
	t.Run("path config/settings.json", func(t *testing.T) {
		assertAllows(t, run(t, "lsp-first", grep("handleSubmit", "path", "config/settings.json")), "path json")
	})
}

func TestLSPFirstFailsOpen(t *testing.T) {
	cases := []struct{ label, payload string }{
		{"non-Grep tool", `{"tool_name":"Bash","tool_input":{"command":"handleSubmit"}}`},
		{"empty stdin", ``},
		{"garbage stdin", `not { valid json`},
		{"literal null stdin", `null`},
		{"empty pattern", grep("")},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			assertAllows(t, run(t, "lsp-first", c.payload), c.label)
		})
	}
}

// The guard's own removal on 2026-08-26 was caused by it nagging toward
// language servers that were dead. It must never do that again.
func TestLSPFirstFailsOpenWhenServerMissing(t *testing.T) {
	empty := t.TempDir()
	t.Run("pinned language, its server absent", func(t *testing.T) {
		r := run(t, "lsp-first", grep("handleSubmit", "glob", "*.rs"), "PATH="+empty)
		assertAllows(t, r, "rust glob with no rust-analyzer")
	})
	t.Run("unpinned language, no servers at all", func(t *testing.T) {
		r := run(t, "lsp-first", grep("handleSubmit"), "PATH="+empty)
		assertAllows(t, r, "no servers on PATH")
	})
	t.Run("still denies when the server is present", func(t *testing.T) {
		shim := t.TempDir()
		if err := os.WriteFile(filepath.Join(shim, "rust-analyzer"), []byte("#!/bin/sh\n"), 0o755); err != nil {
			t.Fatal(err)
		}
		r := run(t, "lsp-first", grep("handleSubmit", "glob", "*.rs"), "PATH="+shim)
		assertDenies(t, r, "rust glob with rust-analyzer present")
	})
}

func TestLSPFirstDenyShape(t *testing.T) {
	r := run(t, "lsp-first", grep("handleSubmit"))
	var parsed map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &parsed); err != nil {
		t.Fatalf("stdout is not JSON: %v", err)
	}
	if _, ok := parsed["decision"]; ok {
		t.Error("no top-level decision key should remain (deprecated contract)")
	}
	hso, _ := parsed["hookSpecificOutput"].(map[string]any)
	if hso["hookEventName"] != "PreToolUse" {
		t.Errorf("hookEventName = %v, want PreToolUse", hso["hookEventName"])
	}
	reason, _ := hso["permissionDecisionReason"].(string)
	const escapeHatch = "re-run this exact Grep with (?:) appended to the end of the pattern (pattern(?:)) to bypass this guard"
	if !strings.Contains(reason, escapeHatch) {
		t.Error("expected the escape-hatch sentence in permissionDecisionReason")
	}
}

// ── secrets-scan ─────────────────────────────────────────────────────────────

// Fixtures are assembled from fragments so the literal patterns never appear in
// this source file — otherwise the secrets-scan hook blocks writing the test.
func TestSecretsScanBlocks(t *testing.T) {
	a := "abcdefghij0123456789ABCDEFGHIJ"
	cases := []struct{ label, payload string }{
		{"anthropic key in Write", `{"tool_name":"Write","tool_input":{"content":"k=` + "sk-" + "ant-api03-" + a + `"}}`},
		{"openai key in Edit", `{"tool_name":"Edit","tool_input":{"new_string":"k=` + "sk-" + a + a + `"}}`},
		{"aws key id in Bash", `{"tool_name":"Bash","tool_input":{"command":"export K=` + "AKIA" + "0123456789ABCDEF" + `"}}`},
		{"github token in MultiEdit", `{"tool_name":"MultiEdit","tool_input":{"edits":[{"new_string":"x"},{"new_string":"` + "ghp_" + a + a + `"}]}}`},
		{"stripe key in NotebookEdit", `{"tool_name":"NotebookEdit","tool_input":{"new_source":"` + "sk_" + "live_" + a + `"}}`},
		{"private key header", `{"tool_name":"Write","tool_input":{"content":"` + "-----BEGIN " + "RSA PRIVATE KEY-----" + `"}}`},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			assertDenies(t, run(t, "secrets-scan", c.payload), c.label)
		})
	}
}

func TestSecretsScanAllows(t *testing.T) {
	cases := []struct{ label, payload string }{
		{"clean content", `{"tool_name":"Write","tool_input":{"content":"hello world"}}`},
		{"empty content", `{"tool_name":"Write","tool_input":{"content":""}}`},
		{"unscanned tool", `{"tool_name":"Read","tool_input":{"file_path":"/tmp/x"}}`},
		{"placeholder", `{"tool_name":"Write","tool_input":{"content":"key = sk-ant-XXX"}}`},
		{"redacted", `{"tool_name":"Write","tool_input":{"content":"key = <REDACTED>"}}`},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			assertAllows(t, run(t, "secrets-scan", c.payload), c.label)
		})
	}
}

// The reason text tells the user to type <REDACTED>; the default JSON encoder
// would emit <REDACTED> and mangle that instruction.
func TestSecretsScanDoesNotHTMLEscapeReason(t *testing.T) {
	a := "abcdefghij0123456789ABCDEFGHIJ"
	r := run(t, "secrets-scan", `{"tool_name":"Write","tool_input":{"content":"k=`+"sk-"+"ant-api03-"+a+`"}}`)
	if strings.Contains(r.stdout, `\u003c`) {
		t.Error("reason was HTML-escaped; SetEscapeHTML(false) is not in effect")
	}
	if !strings.Contains(r.stdout, "`<REDACTED>`") {
		t.Error("expected the backticked <REDACTED> placeholder in the reason")
	}
}

// This is a PROTECTION hook: unreadable or unparseable input must block, not pass.
func TestSecretsScanFailsClosed(t *testing.T) {
	for _, payload := range []string{``, `not json`} {
		r := run(t, "secrets-scan", payload)
		assertDenies(t, r, "fail-closed on "+payload)
	}
}

// ── coverage carried over from the .mjs suites these hooks replaced ─────────

// A non-object payload must not read as an empty struct. `null` unmarshals into
// a struct without error and leaves every field zero, which would make
// secrets-scan exit 0 on input it never scanned.
func TestNonObjectPayloadFailsClosed(t *testing.T) {
	for _, payload := range []string{`null`, `"a string"`, `[1,2]`, `42`} {
		t.Run(payload, func(t *testing.T) {
			assertDenies(t, run(t, "secrets-scan", payload), "non-object "+payload)
		})
	}
}


func TestSecretsScanBashClean(t *testing.T) {
	assertAllows(t, run(t, "secrets-scan", `{"tool_name":"Bash","tool_input":{"command":"ls -la /tmp"}}`), "clean bash")
}
