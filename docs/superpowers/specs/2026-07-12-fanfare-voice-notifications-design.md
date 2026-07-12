# Fanfare: ElevenLabs voice notifications for Claude Code events

**Date:** 2026-07-12
**Status:** Approved (brainstorm 2026-07-12)
**Repo:** dotfiles (chezmoi-managed)

## Motivation

The existing `tab-title.mjs` hook plays `Glass.aiff` only when Claude is
waiting on input; turn completion (Stop) is silent apart from the ✅ tab
title. Jason wants finish/attention notifications to be fun: an epic
movie-trailer voice ("I'M DOOONE!") generated with his ElevenLabs account.

## Decisions (from brainstorm Q&A)

- **Trigger:** both event families voiced — Stop gets "done" lines;
  `permission_prompt`/`agent_needs_input` gets "need you" lines (replacing
  Glass.aiff). `idle_prompt` stays silent (title-only), as today.
- **Location:** dotfiles repo, alongside the existing hook. Not a
  claude-skills plugin.
- **Approach:** pre-generated clip library (Approach A). No live TTS at
  hook time — zero latency, no per-turn credit spend, no API key in hook
  runtime, works offline.
- **Persona:** single consistent "epic movie-trailer guy" voice, rotating
  clips per event so repetition doesn't kill the joke.

## Architecture

### 1. Phrase/config file — `private_dot_claude/sounds/fanfare/phrases.json`

```json
{
  "voice_id": "<chosen at generation time>",
  "model_id": "eleven_multilingual_v2",
  "phrases": {
    "stop": [
      "I'M DOOONE!",
      "IT IS FINISHED.",
      "YOUR MOVE, HUMAN.",
      "THE DEED... IS DONE.",
      "MISSION. ACCOMPLISHED.",
      "BEHOLD! IT IS COMPLETE!"
    ],
    "input": [
      "I REQUIRE YOUR GUIDANCE!",
      "HUMAN! YOUR PERMISSION IS NEEDED!",
      "I AM... BLOCKED!",
      "A DECISION AWAITS, MORTAL!",
      "INPUT. REQUIRED."
    ]
  }
}
```

### 2. Generation script — `dot_local/bin/executable_fanfare-generate` (Node 20, stdlib only)

- Reads `~/.claude/sounds/fanfare/phrases.json`.
- Fetches the ElevenLabs API key on demand: `op-fast read` with fallback to
  `op read` (same on-demand pattern as Stripe/Cloudflare — never exported at
  shell startup). Item path: `op://Private/elevenlabs/credential`
  (**confirm/create at implementation time**).
- `--list-voices` flag: GET `/v1/voices`, print id + name + labels so Jason
  can pick a trailer-style voice; chosen id is written to `phrases.json`.
- For each phrase: POST `/v1/text-to-speech/{voice_id}`, write
  `~/.claude/sounds/fanfare/{event}/NN-<hash>.mp3`. Filename embeds a short
  hash of (phrase, voice_id, model_id) so re-runs skip unchanged lines and
  orphaned clips (removed phrases) are deleted.
- Prints a reminder to `chezmoi add ~/.claude/sounds/fanfare` so clips
  (~1–2 MB total) are committed and sync to other machines. Never runs
  `chezmoi apply` itself.

### 3. Hook change — `private_dot_claude/hooks/tab-title.mjs`

- New clip-pick step where `sound` is decided today:
  - `Stop` → random `.mp3` from `<fanfare dir>/stop/`
  - `permission_prompt` / `agent_needs_input` → random `.mp3` from
    `<fanfare dir>/input/` (replaces Glass.aiff when clips exist)
  - Fanfare dir defaults to `~/.claude/sounds/fanfare`, overridable via
    `CLAUDE_FANFARE_DIR` (used by tests to point at a temp dir).
- Playback stays `afplay`, detached, macOS-only, as today.
- **Fail-open:** fanfare dir missing/empty or any fs error → legacy
  behavior exactly (Glass.aiff for input events, silence for Stop).
- `CLAUDE_TAB_TITLE_SILENT=1` still disables all audio (tests rely on it).
- **Chorus guard:** before playing, check a lockfile in `os.tmpdir()`
  (`claude-fanfare.lock`); if its mtime is < 2 s old, skip the voice
  (play nothing); otherwise touch it and play. Prevents parallel Ghostty
  tabs finishing together from yelling in chorus.

## Error handling

Every failure path is silent and non-blocking: JSON parse errors, missing
dirs, afplay absence, lockfile races — the hook must never break the tab
title or the turn. The generation script is the opposite: it fails loudly
(non-zero exit, clear message) on missing `op` item, HTTP errors, or quota
exhaustion, since it's run interactively.

## Testing (`node --test tests/`)

- `tests/tab-title.test.mjs` (extend): clip selection per event; fallback to
  legacy chime/silence when fanfare dir is missing or empty; silent-env
  override; chorus-guard skip (fresh lockfile → no afplay spawn).
  Tests point the hook at a temp fanfare dir via env override
  (`CLAUDE_FANFARE_DIR`) to avoid touching real `~/.claude`.
- `tests/fanfare-generate.test.mjs` (new): phrase→filename hash mapping;
  skip-unchanged and orphan-deletion logic; config validation. HTTP layer
  stubbed — no live API calls in tests.

## Out of scope

- Live/dynamic TTS at hook time (rejected: latency, cost, key exposure).
- Voicing `idle_prompt` or subagent events.
- Volume normalization / per-event volume config (afplay defaults; revisit
  only if clips come out unbalanced).
- Windows/Linux support (hook is already darwin-gated for sound).

## Open items (resolved at implementation)

1. Exact 1Password item path for the ElevenLabs key (create if absent).
2. Voice choice — picked interactively via `fanfare-generate --list-voices`.
