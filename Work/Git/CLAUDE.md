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

The pattern:

```toml
# ~/.cargo/config.toml — user-level, applies to all cargo invocations
[build]
target-dir = "/Users/jasonmatthew/.cache/cargo-target/<workspace-name>"
```

**Tradeoff:** the user-level path is workspace-specific. If you ever work on a *second* Rust repo concurrently with the first, drop a per-repo `.cargo/config.toml` (or set `CARGO_TARGET_DIR` per-shell) to override. Cargo walks up from cwd, so per-repo wins over user-level.

**Why this is safe** (researched 2026-05-25, cargo 1.95):
- Cargo holds an OS-level lock on the build dir per-process. Concurrent builds against the same target-dir serialize, they don't corrupt — *for same workspace, same target triple, local FS*.
- The one real sharp edge is [cargo #5968](https://github.com/rust-lang/cargo/issues/5968): native + cross-target (e.g. `cargo build` + `cargo component build` for `wasm32-wasip1`) racing on shared `target/release/` build-script artifacts. Failures are loud (`linker: file truncated`, `missing build-script-build`), not silent. If you see them, wrap `cargo component build` in `flock $CARGO_TARGET_DIR/.cross-target-lock`.
- sccache layered on top is complementary, not conflicting. If you use it across worktrees, set `SCCACHE_BASEDIRS` to the worktrees parent so absolute paths don't leak into cache keys ([sccache #196](https://github.com/mozilla/sccache/issues/196)).
- Requires cargo ≥ 1.94 / Rust ≥ 1.93 — earlier versions had a `cargo check` locking gap ([rust-lang/cargo PR #16385](https://github.com/rust-lang/cargo/pull/16385)).

**Don't** commit a `target-dir` override into a repo's `.cargo/config.toml` casually — it changes build behavior for everyone including CI. Per-repo overrides for absolute paths belong in `.git/info/exclude`'d files or env vars, not committed config.
