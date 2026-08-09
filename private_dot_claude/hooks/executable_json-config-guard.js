#!/usr/bin/env node

/**
 * JSON Config Guard
 *
 * PostToolUse hook on Edit/Write/MultiEdit. When the edited file is one of
 * Claude Code's JSON config files, re-parse it and report a syntax error back
 * to the model immediately.
 *
 * Why this exists: Claude Code does not error on a malformed settings.json —
 * it drops the block it cannot parse and carries on. A stray comma in the
 * hooks object silently disables every guard in this repo, and the failure
 * surfaces a session later as "the hook stopped firing", with no error to
 * trace it back to. The edit that caused it is the cheapest place to catch it.
 *
 * PostToolUse runs after the write, so this cannot deny — it exits 2 with the
 * parse error on stderr, which Claude Code feeds back to the model as
 * something to fix now.
 *
 * This is an ADVISORY hook and fails OPEN: an unreadable stdin, an unparseable
 * payload, or a missing file exits 0. The guard exists to surface a mistake the
 * model just made, not to wedge the session when the harness surprises it. The
 * one thing it must never do is stay silent about genuinely broken JSON.
 */

const { readFileSync } = require('node:fs');
const { basename } = require('node:path');

/** Config files whose corruption fails silently in the harness. */
const GUARDED = new Set(['settings.json', 'settings.local.json', '.mcp.json']);

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(''));
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // fail open — not our payload to police
  }

  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !GUARDED.has(basename(filePath))) {
    process.exit(0);
  }

  let contents;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch {
    process.exit(0); // deleted or moved between write and hook — not a syntax problem
  }

  // An empty file is valid state for a config Claude Code creates lazily.
  if (!contents.trim()) process.exit(0);

  try {
    JSON.parse(contents);
  } catch (err) {
    process.stderr.write(
      `${filePath} is no longer valid JSON: ${err.message}\n\n` +
      `Claude Code does not report this — it silently drops the config it cannot ` +
      `parse, so hooks and permissions defined in this file stop applying. Fix the ` +
      `syntax before continuing.\n`
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
