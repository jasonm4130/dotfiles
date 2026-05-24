# Code Work (`~/Work/Git/**`)

Guidance that applies when working in any of Jason's code repos. Loaded lazily by Claude Code when a session works in this tree.

## LSP-First Code Navigation

When working in code files (TS, JS, Python, Rust, Go, etc.):

1. Use LSP `goToDefinition` instead of grepping for function/class definitions
2. Use LSP `findReferences` instead of grepping for symbol usages
3. Use LSP `hover` to check types instead of reading entire files
4. Use LSP `documentSymbol` to understand file structure
5. Only use Grep for: text searches, TODOs, string literals, log messages, config values
6. Only fall back to Grep when LSP returns empty results or is unavailable

The `lsp-first-guard.js` PreToolUse hook enforces this for Grep calls that look like code-symbol lookups; it doesn't replace the rule, just catches misses.

## Rust: shared cargo target-dir for parallel worktrees

When spawning parallel sub-agents in git worktrees of a Rust workspace, point them at a single shared `target/` instead of letting each worktree clone its own (5–20 GB per worktree adds up fast — recovered ~28 GB after one bad day).

**Per-repo via `mise.local.toml`** (preferred — most Rust repos here already use mise for toolchain pinning):

```toml
# <repo>/mise.local.toml — gitignored personal override
[env]
CARGO_TARGET_DIR = "/Users/jasonmatthew/.cache/cargo-target/<repo-name>"
```

Then `mise trust mise.local.toml` once. Cargo reads `CARGO_TARGET_DIR` from env (overrides anything in `.cargo/config.toml`). Mise's env var activates whenever cwd is inside the repo tree — so worktrees under `.claude/worktrees/agent-*/` and sub-agents launched via the Agent tool inherit it automatically.

Add `mise.local.toml` to `.gitignore` if not already (the absolute path is user-specific).

**Why per-repo, not user-level `~/.cargo/config.toml`:** user-level `[build] target-dir` applies to *every* Rust repo on the machine, so two concurrent Rust projects would collide on artifact names. Per-repo via mise scopes it correctly.

**Why not commit a `[build] target-dir` into the repo's `.cargo/config.toml`:** it'd change build paths for CI runners and other contributors. Path-relocating CI breaks rust-cache action assumptions about `target/`. Personal cache prefs belong in personal overrides.

**Why this is safe** (researched 2026-05-25, cargo 1.95):
- Cargo holds an OS-level lock on the build dir per-process. Concurrent builds against the same target-dir serialize, they don't corrupt — *for same workspace, same target triple, local FS*.
- The one real sharp edge is [cargo #5968](https://github.com/rust-lang/cargo/issues/5968): native + cross-target (e.g. `cargo build` + `cargo component build` for `wasm32-wasip1`) racing on shared `target/release/` build-script artifacts. Failures are loud (`linker: file truncated`, `missing build-script-build`), not silent. If you see them, wrap `cargo component build` in `flock $CARGO_TARGET_DIR/.cross-target-lock`.
- sccache layered on top is complementary, not conflicting. If you use it across worktrees, set `SCCACHE_BASEDIRS` to the worktrees parent so absolute paths don't leak into cache keys ([sccache #196](https://github.com/mozilla/sccache/issues/196)).
- Requires cargo ≥ 1.94 / Rust ≥ 1.93 — earlier versions had a `cargo check` locking gap ([rust-lang/cargo PR #16385](https://github.com/rust-lang/cargo/pull/16385)).

**If a repo doesn't use mise:** drop a `.envrc` for direnv with `export CARGO_TARGET_DIR=...`, or just `export` it in your shell session before launching agents. Same effect, different activation hook.
