/**
 * json-config-guard is a PostToolUse hook that re-parses Claude Code's JSON
 * config files after an edit. It must exit 2 (feed the error back to the model)
 * on genuinely broken JSON, and exit 0 on absolutely everything else — it is
 * advisory, and a guard that wedges the session on an unexpected payload is
 * worse than the silent-drop problem it exists to surface.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hook = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../private_dot_claude/hooks/executable_json-config-guard.js',
);

/** Run the hook with `stdin`, resolving to {code, stderr}. */
function run(stdin) {
  return new Promise((resolve) => {
    const child = execFile('node', [hook], (err, _stdout, stderr) => {
      resolve({ code: err?.code ?? 0, stderr: stderr ?? '' });
    });
    child.stdin.end(stdin);
  });
}

/** Write `contents` to `name` in a fresh temp dir and return the full path. */
function fixture(t, name, contents) {
  const dir = mkdtempSync(path.join(tmpdir(), 'json-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = path.join(dir, name);
  writeFileSync(p, contents);
  return p;
}

const payload = (filePath) => JSON.stringify({ tool_input: { file_path: filePath } });

test('malformed settings.json exits 2 and names the file', async (t) => {
  const p = fixture(t, 'settings.json', '{"a":1,}');
  const { code, stderr } = await run(payload(p));
  assert.equal(code, 2);
  assert.match(stderr, /no longer valid JSON/);
  assert.ok(stderr.includes(p), 'the error must name the offending file');
});

test('valid settings.json exits 0 silently', async (t) => {
  const p = fixture(t, 'settings.json', '{"hooks":{}}');
  const { code, stderr } = await run(payload(p));
  assert.equal(code, 0);
  assert.equal(stderr, '');
});

test('guards settings.local.json and .mcp.json too', async (t) => {
  for (const name of ['settings.local.json', '.mcp.json']) {
    const p = fixture(t, name, '{oops}');
    const { code } = await run(payload(p));
    assert.equal(code, 2, `${name} should be guarded`);
  }
});

test('ignores files it does not guard', async (t) => {
  const p = fixture(t, 'package.json', '{"a":1,}'); // malformed, but not ours
  const { code } = await run(payload(p));
  assert.equal(code, 0);
});

test('empty config file is not an error', async (t) => {
  const p = fixture(t, 'settings.json', '   \n');
  const { code } = await run(payload(p));
  assert.equal(code, 0);
});

test('fails open on unusable input', async () => {
  for (const stdin of ['', 'not json at all', '{}', '{"tool_input":{}}']) {
    const { code } = await run(stdin);
    assert.equal(code, 0, `stdin ${JSON.stringify(stdin)} must not wedge the session`);
  }
});

test('fails open when the file vanished between write and hook', async () => {
  const { code } = await run(payload(path.join(tmpdir(), 'nope-does-not-exist/settings.json')));
  assert.equal(code, 0);
});
