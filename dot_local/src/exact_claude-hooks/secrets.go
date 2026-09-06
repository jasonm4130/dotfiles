package main

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

type secretPattern struct {
	name  string
	regex *regexp.Regexp
}

// High-confidence patterns, tuned to minimise false positives while still
// catching the obvious ones. Keep this list focused — every false positive is
// friction, every miss is a potential leak.
//
// Compiled lazily inside secretsScan rather than in a package-level var: a var
// block would compile all ten on every run of every subcommand, including the
// common case where we exit before ever needing them.
func secretPatterns() []secretPattern {
	p := func(name, expr string) secretPattern {
		return secretPattern{name, regexp.MustCompile(expr)}
	}
	return []secretPattern{
		p("Anthropic API key", `sk-ant-[a-zA-Z0-9_-]{20,}`),
		p("OpenAI API key", `\bsk-[a-zA-Z0-9]{32,}\b`),
		p("AWS access key ID", `\bAKIA[0-9A-Z]{16}\b`),
		p("AWS secret-key assignment", `AWS_SECRET_ACCESS_KEY\s*[=:]\s*["']?[a-zA-Z0-9/+]{30,}["']?`),
		p("GitHub token", `\bgh[pousr]_[a-zA-Z0-9]{30,}\b`),
		p("Stripe key", `\bsk_(?:live|test)_[a-zA-Z0-9]{20,}\b`),
		p("Buffer token assignment", `BUFFER_TOKEN\s*[=:]\s*["']?[a-zA-Z0-9_.\-]{20,}["']?`),
		p("Slack token", `\bxox[baprs]-[a-zA-Z0-9-]{10,}\b`),
		p("Private key header", `-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----`),
		p("Cloudflare API token (long URL-safe assignment)", `CF(?:_API)?_TOKEN\s*[=:]\s*["']?[a-zA-Z0-9_-]{30,}["']?`),
	}
}

// secretsScan blocks a write whose new content carries a recognisable secret.
//
// This is a PROTECTION hook, so it fails CLOSED: if stdin cannot be read or the
// payload cannot be parsed, the write is denied rather than silently unscanned.
// A swallowed error here would mean the guard stops protecting without anyone
// noticing.
func secretsScan() {
	in, why := readPayload()
	switch why {
	case readUnreadable:
		deny("SECRETS-SCAN", "SECRETS-SCAN: could not read hook input — failing closed (write blocked because it could not be scanned). Re-run the edit; if this persists, check the claude-hooks binary.")
	case readUnparseable:
		deny("SECRETS-SCAN", "SECRETS-SCAN: could not parse hook input JSON — failing closed (write blocked because it could not be scanned).")
	case readNotAnObject:
		deny("SECRETS-SCAN", "SECRETS-SCAN: hook input was not an object — failing closed (write blocked because it could not be scanned).")
	}

	var content string
	switch in.ToolName {
	case "Write":
		content = in.ToolInput.Content
	case "Edit":
		content = in.ToolInput.NewString
	case "MultiEdit":
		parts := make([]string, 0, len(in.ToolInput.Edits))
		for _, e := range in.ToolInput.Edits {
			parts = append(parts, e.NewString)
		}
		content = strings.Join(parts, "\n")
	case "NotebookEdit":
		content = in.ToolInput.NewSource
	case "Bash":
		// A heredoc/redirect through Bash writes a file without touching the
		// write tools, so the command line gets the same scan as file content.
		content = in.ToolInput.Command
	case "apply_patch":
		// Codex sends the patch in command, not Claude's content/new_string.
		// An absent field means the payload was not scanned; block schema drift.
		content = in.ToolInput.Command
		if content == "" {
			deny("SECRETS-SCAN", "SECRETS-SCAN: Codex patch has no command — failing closed because the patch could not be scanned.")
		}
	default:
		os.Exit(0)
	}

	if content == "" {
		os.Exit(0)
	}

	var matched []string
	for _, sp := range secretPatterns() {
		if sp.regex.MatchString(content) {
			matched = append(matched, sp.name)
		}
	}
	if len(matched) == 0 {
		os.Exit(0)
	}

	deny("SECRETS-SCAN", fmt.Sprintf(`SECRETS-SCAN: Detected potential secret(s) in tool input — blocking the write.

Matches: %s

If this is intentional (editing a gitignored .env, an encrypted fixture, or a placeholder example), bypass by:
- Replacing the real value with a placeholder like `+"`sk-ant-XXX`"+` or `+"`<REDACTED>`"+`
- Confirming with the user before re-running
- Editing the file directly outside Claude Code

False positives are intentional. The cost of asking is much lower than the cost of a leaked key.`,
		strings.Join(matched, ", ")))
}
