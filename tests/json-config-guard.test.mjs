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
function run(stdin, env) {
  return new Promise((resolve) => {
    const opts = env ? { env: { ...process.env, ...env } } : {};
    const child = execFile('node', [hook], opts, (err, _stdout, stderr) => {
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

/* ---- Bash payloads -------------------------------------------------------
 * A `sed -i`, heredoc redirect or `tee` rewrites a config file without the
 * write tools being involved, so the guard also reads Bash command lines.
 */

const bashPayload = (command, cwd) =>
  JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } });

test('Bash command naming a broken guarded file exits 2 and names it', async (t) => {
  const p = fixture(t, 'settings.json', '{"a":1,}');
  const { code, stderr } = await run(bashPayload(`sed -i '' 's/a/b/' ${p}`));
  assert.equal(code, 2);
  assert.ok(stderr.includes(p), 'the error must name the offending file');
});

test('Bash command naming a valid guarded file exits 0', async (t) => {
  const p = fixture(t, '.mcp.json', '{"mcpServers":{}}');
  const { code, stderr } = await run(bashPayload(`cat > ${p} <<EOF`));
  assert.equal(code, 0);
  assert.equal(stderr, '');
});

test('Bash command naming no guarded file exits 0', async () => {
  const { code } = await run(bashPayload('git status --short && ls -la'));
  assert.equal(code, 0);
});

test('Bash command naming a guarded path that does not exist exits 0', async () => {
  const p = path.join(tmpdir(), 'nope-does-not-exist/settings.json');
  const { code } = await run(bashPayload(`tee ${p}`));
  assert.equal(code, 0);
});

test('a ~/-prefixed guarded path resolves against the home directory', async (t) => {
  // HOME is overridden for the child, so os.homedir() lands in the temp dir and
  // the expansion is proven without writing into the real home.
  const p = fixture(t, 'settings.json', '{"a":1,}');
  const home = path.dirname(p);
  const { code, stderr } = await run(bashPayload("sed -i '' s/a/b/ ~/settings.json"), { HOME: home });
  assert.equal(code, 2);
  assert.ok(stderr.includes(p), 'the ~ must be expanded to the home directory');
});

test('a $HOME/-prefixed guarded path resolves against the home directory', async (t) => {
  const p = fixture(t, 'settings.json', '{"a":1,}');
  const home = path.dirname(p);
  const { code, stderr } = await run(bashPayload('tee $HOME/settings.json'), { HOME: home });
  assert.equal(code, 2);
  assert.ok(stderr.includes(p), '$HOME must be expanded to the home directory');
});

test('a relative guarded path resolves against the payload cwd', async (t) => {
  const p = fixture(t, 'settings.json', '{"a":1,}');
  const { code, stderr } = await run(bashPayload('sed -i "" s/a/b/ settings.json', path.dirname(p)));
  assert.equal(code, 2);
  assert.ok(stderr.includes(p), 'a relative path must resolve against payload.cwd');
});

test('two broken guarded files in one command are both named', async (t) => {
  const a = fixture(t, 'settings.json', '{"a":1,}');
  const b = fixture(t, 'settings.local.json', '{oops}');
  const { code, stderr } = await run(bashPayload(`cp ${a} /dev/null; tee ${b}`));
  assert.equal(code, 2);
  assert.ok(stderr.includes(a), 'must name the first file');
  assert.ok(stderr.includes(b), 'must name the second file');
});
