# Research: What Best-in-Class Claude Code Hook Repos Do (2026-07-12)

Deep-dive via 5 research angles (Sonnet workers, blind tier-1 verification per
angle; one angle re-run after returning a stub). Reliability per angle:
runtime-deps **high**, plugin-ecosystem **high**, deep-read **high**,
architecture-patterns (gap-fill) **high** (3 partials noted inline),
repo-survey **medium**. Question: what do the strongest hook ecosystems
converge on — runtimes, cross-platform, architecture, dependency management,
testing — and what beats a stdlib-only Node `.mjs` setup?

## Key findings

**1. There is no runtime convergence — but there is a *shape* convergence.**
Anthropic's own official marketplace ships python3-stdlib hooks (hookify) next
to raw bash hooks (ralph-loop). Community statuslines split across Node
(cc-statusline), pure bash+jq (craft-statusline, "No Node, no Python" as a
selling point), and Bun-run TypeScript (claude-hud). What *does* converge is
the shape: **single-file, interpreter-run, self-contained scripts with no
shared dependency tree**. The canonical Python idiom is uv single-file scripts
with PEP 723 inline deps (`#!/usr/bin/env -S uv run --script`) — the pattern
disler/claude-code-hooks-mastery (3.8k stars) popularized and independent
blogs turned into a de facto convention. A stdlib-only `.mjs` file is the JS
expression of the same shape — it just achieves "no dependency management" by
having no dependencies instead of inlining them.

**2. Compiled hooks are technically validated and socially rejected.** Rust
(catalyst, 11 stars) and Go (hook-observatory) hook tools report ~2 ms
startup vs 100–200 ms interpreted — catalyst even scopes honestly where that
matters (UserPromptSubmit yes; Stop hooks no). Adoption stays single-digit
stars, and hook-observatory's Go rewrite still ships no Windows binary. The
one cross-platform compiled pattern documented (dev.to, May 2026) is a thin
bash/PowerShell launcher that downloads a prebuilt per-OS Go binary — a blog
pattern, not a tool with traction. Verdict matches our measurement (~25-30 ms
Node cold start on Apple Silicon): the juice isn't worth the squeeze for
almost anyone.

**3. Windows is the ecosystem's open wound, and the ecosystem's answer is
Node.** A cluster of still-open-or-not-planned issues (#18610, #59225,
#32930, #18527) covers bundled-bash path mangling, silent shell selection,
and Git Bash popups. Official docs steer authors to **exec form
(`command` + `args`) with a real executable** — explicitly noting npm's
.cmd/.bat shims can't be spawned and recommending `node` + script path
because "node.exe is a real binary." A community fork fixed a broken
bash-hook plugin by rewriting hooks in Node specifically for this reason.

**4. Fail-open vs fail-closed has a real consensus — split by hook class.**
Advisory hooks (logging, notifiers, statuslines): fail open, always exit 0,
never block the session (disler's statusline prints a fallback "Error"
segment rather than crash; another statusline "exits silently on any error").
**Protection hooks (security guards): fail closed** — mandelbro/
awesome-claude-hooks (`parse_input || exit 2` for security hooks), the
claude-hook-guard base-class taxonomy (ProtectionBase/ValidationBase fail
closed, LoggingBase fails open), and a May-2026 incident writeup where a
swallowed exception silently disabled a guard. One scoped counterpoint
(single source): Stop-hooks-as-test-gates shouldn't hard-block (retry-loop
risk).

**5. Guard mechanics: JSON `permissionDecision` is winning over exit-code 2.**
Docs make the two channels mutually exclusive per hook. `exit 1` is a footgun
(treated as hook crash → action proceeds). Exit-2 blocking is corroborated
as inconsistent for Edit/Write (works for Bash) — issue #37210 + the
"exit-code-2 trap" writeup recommend `exit 0` + `hookSpecificOutput.
permissionDecision: "deny"` for guards. *(Partial: the issue's own resolution
partly blames the reporter's wrapper; treat "unreliable" as directionally
right, not a confirmed platform bug.)* The older `decision` field is
deprecated for PreToolUse.

**6. Almost nobody tests hooks.** The most popular hooks repo (disler)
claims "11/13 validated via automated testing" with **zero test artifacts
anywhere in its git tree** (verified via full-tree listing). claude-code-
templates (29k stars) tests its installer plumbing, not its 39-45 hooks
(its own pages disagree on the count). The only strong example —
johnlindquist/claude-hooks: mocha unit/integration/smoke + a 3-OS × 2-Node
CI matrix — has been dead since Aug 2025. Exceptions are appearing in 2026:
Anthropic ships `test-hook.sh`/`hook-linter.sh`/`validate-hook-schema.sh` in
plugin-dev (verified present), bats-core appears for shell hooks, and a
Python mock-payload harness exists. Norm remains `echo '{}' | ./hook.sh`.

**7. Statusline hard lessons from tools with real traction** (claude-hud
26.3k stars; ccusage ~17k; ccstatusline 11.7k): (a) ccusage #459 — rapid
statusline ticks spawned 34+ overlapping subprocesses at 100% CPU; fixed
with a per-session semaphore — debounce/locking is not optional at scale;
(b) read only the transcript tail (one tool reads the last 16 KB) for
performance; (c) `refreshInterval` exists since 2.1.97 *(max-60s bound
unconfirmed)*; (d) statuslines must never hard-fail. Plugin-system gap
confirmed: manifests can't declare a primary statusLine and
`${CLAUDE_PLUGIN_ROOT}` doesn't expand there (#52079 "expected", #64074) —
installers write settings.json directly.

**8. State & loop-guard patterns.** `stop_hook_active` boolean in Stop-hook
stdin is the documented loop guard *(partial: a numeric "8-continuation cap"
could not be confirmed — treat as boolean-only)*. Parsing `transcript_path`
JSONL is the standard way hooks recover session state without their own
store (three independent implementations). The hardened example (Langfuse):
SHA-256 state key from session_id+transcript_path, atomic temp-file +
`os.replace` writes, FileLock serialization.

## What this means for this repo's setup

Validated as-is:
- **Stdlib-only `.mjs` + Node on PATH** is a first-class expression of the
  ecosystem's winning shape; nothing found does distribution better for a
  single-OS chezmoi fleet. The Windows escape hatch, if ever needed, is
  exec-form + `node` — already our runtime.
- **Fail-open advisory hooks** (tab-title/fanfare, statusline) match
  consensus exactly, including the "statusline never hard-fails" discipline.
- **Fanfare's pre-generated clips** beat the ecosystem's TTS norm (runtime
  API chains with provider fallbacks) on reliability: no network, no key, no
  fallback chain needed. The chorus-guard lockfile matches the
  debounce/semaphore lesson ccusage learned in production.
- **`node --test` suites for every hook** put this repo ahead of every
  popular hook collection surveyed except one abandoned repo.

Worth adopting:
1. **Audit guards by class: protection hooks should fail closed.** Advisory
   guards (lsp-first-guard nudge) are correctly fail-open; anything actually
   protective (secrets-scan) should block-on-error per the ProtectionBase
   consensus, not swallow exceptions.
2. **Prefer `exit 0` + `permissionDecision: "deny"` JSON over exit-code 2**
   in PreToolUse guards, especially any matching Edit/Write.
3. **A GitHub Actions matrix for the dotfiles test suite** (the one good
   idea from the abandoned johnlindquist repo): `node --test tests/` across
   macOS + Linux × two Node majors is nearly free and future-proofs the
   hooks for any fleet expansion.
4. If the statusline ever adopts `refreshInterval`: add the tail-read and
   overlapping-invocation guard patterns pre-emptively.

## Flags / contradictions
- claude-code-templates' own pages disagree on hook count (39+ vs 45+).
- Exit-2 Edit/Write unreliability is directionally corroborated but the
  underlying issue partially self-inflicted; deny-JSON remains the safer
  recommendation either way.
- `refreshInterval` 60s max and the "8-continuation cap": unconfirmed.
- Compiled-hook perf numbers (catalyst ~2ms, hook-observatory 22×) are
  self-reported by tiny repos; direction credible, magnitudes unaudited.
- One heavy source-domain: much guard-convention material traces to the
  official hooks docs — canonical but a single perspective.

## Sources (grouped by angle)

**Repo survey:** github.com/hesreallyhim/awesome-claude-code ·
github.com/davila7/claude-code-templates ·
github.com/disler/claude-code-hooks-mastery ·
github.com/rohitg00/awesome-claude-code-toolkit ·
github.com/shanraisshan/claude-code-hooks ·
github.com/karanb192/claude-code-hooks ·
github.com/johnlindquist/claude-hooks ·
github.com/ithiria894/awesome-claude-code-hooks

**Plugin ecosystem:** code.claude.com/docs/en/hooks ·
code.claude.com/docs/en/plugins-reference ·
github.com/anthropics/claude-plugins-official (hookify, ralph-loop) ·
github.com/derjochenmeyer/claude-code-craft-statusline ·
github.com/SammyLin/cc-statusline · github.com/r1di/claude-code-plugins-windows ·
anthropics/claude-code#52079, #64074 · ruvnet/ruflo#387

**Runtimes & deps:** docs.astral.sh/uv/guides/scripts ·
mcginniscommawill.com/posts/2026-04-27-claude-code-hooks-force-uv ·
github.com/parcadei/Continuous-Claude-v3 (hook_launcher.py) ·
egghead.io (type-safe hooks with Bun) · github.com/dwalleck/catalyst ·
github.com/operonlab/hook-observatory ·
dev.to/shrsv (cross-platform Go hooks) ·
anthropics/claude-code#18610, #59225, #32930, #18527

**Architecture patterns:** code.claude.com/docs/en/hooks ·
blog.boucle.sh/posts/the-exit-code-2-trap · anthropics/claude-code#37210,
#6966 · github.com/mandelbro/awesome-claude-hooks (docs/exit-codes.md) ·
dev.to/redpa (fail-open danger) · github.com/misty7kr/claude-hook-guard ·
github.com/sirmalloc/ccstatusline · github.com/ryoppippi/ccusage (#459) ·
github.com/jarrodwatts/claude-hud · langfuse.com/integrations/developer-tools/claude-code ·
blog.gitbutler.com (hooks automation) · anthropics/claude-code
plugins/plugin-dev hook-development scripts · MasuRii/opencode-smart-voice-notify ·
husniadil/cc-hooks · ddaikodaiko/claude-notify

**Deep-read:** raw sources of disler/claude-code-hooks-mastery
(pre_tool_use.py, status_line_v9.py, settings.json, full git tree) ·
johnlindquist/claude-hooks (lib.ts, index.ts templates, test/, CI workflow) ·
davila7/claude-code-templates (hook manifests, Jest suites, CI workflows)
