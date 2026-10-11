import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The fleet CODEX_HOME rendered from this checkout into a temporary destination, with an
// empty chezmoi config so neither the machine's config nor its source dir leaks in.
const sourceDir = fileURLToPath(new URL('..', import.meta.url));
function render(t, liveConfig) {
  const dest = mkdtempSync(join(tmpdir(), 'codex-fm-workers-'));
  t.after(() => rmSync(dest, {recursive: true, force: true}));
  const config = join(dest, 'chezmoi.toml');
  writeFileSync(config, '');
  const home = join(dest, '.codex-fm-workers');
  const apply = () => execFileSync('chezmoi', ['--config', config, '--source', sourceDir, '--destination', dest,
    '--no-tty', '--force', 'apply', home], {encoding: 'utf8'});
  if (liveConfig !== undefined) {
    apply();
    writeFileSync(join(home, 'config.toml'), liveConfig(home));
  }
  apply();
  const toml = readFileSync(join(home, 'config.toml'), 'utf8');
  const value = JSON.parse(execFileSync('chezmoi', ['--config', config, 'execute-template', '--with-stdin',
    '{{ fromToml .chezmoi.stdin | toJson }}'], {input: toml, encoding: 'utf8'}));
  return {home, value};
}

// Codex's hook trust hash (codex-rs hooks discovery.rs hook_hash + config fingerprint.rs
// version_for_toml): sha256 of sorted, compact JSON of the normalized hook identity.
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v);
const codexHookHash = (event, group, handler) => 'sha256:' + createHash('sha256')
  .update(canonical({event_name: event, matcher: group.matcher, hooks: [{async: false, ...handler}]})).digest('hex');

test('the hash rule reproduces a trust hash Codex itself wrote', () => {
  // ~/.codex's unattended guard entry, trusted through /hooks on codex-cli 0.162.1.
  const group = {matcher: 'Bash|apply_patch'};
  const handler = {type: 'command', command: "bash '/Users/jasonmatthew/.codex/hooks/unattended-guard.sh'", timeout: 15};
  assert.equal(codexHookHash('pre_tool_use', group, handler),
    'sha256:7eaf581a08bec45adf0208e0c34b4a819ba5449edef32d92c77cad172b7df71e');
});

test('fleet home reuses the personal rules and guard byte for byte', t => {
  const {home} = render(t);
  assert.equal(readFileSync(join(home, 'rules/unattended.rules'), 'utf8'),
    readFileSync(new URL('../dot_codex/rules/unattended.rules', import.meta.url), 'utf8'));
  assert.equal(readFileSync(join(home, 'hooks/unattended-guard.sh'), 'utf8'),
    readFileSync(new URL('../dot_codex/hooks/executable_unattended-guard.sh', import.meta.url), 'utf8'));
  assert.ok(statSync(join(home, 'hooks/unattended-guard.sh')).mode & 0o100);
  assert.equal(statSync(join(home, 'config.toml')).mode & 0o777, 0o600);
});

test('fleet config pre-trusts exactly its own guard hook', t => {
  const {home, value} = render(t);
  const hooks = JSON.parse(readFileSync(join(home, 'hooks.json'), 'utf8')).hooks;
  assert.deepEqual(Object.keys(hooks), ['PreToolUse']);
  const [group] = hooks.PreToolUse;
  const [handler] = group.hooks;
  assert.equal(handler.command, `bash '${home}/hooks/unattended-guard.sh'`);
  assert.equal(value.approval_policy, 'never');
  assert.equal(value.features.hooks, true);
  assert.deepEqual(value.hooks.state, {
    [`${home}/hooks.json:pre_tool_use:0:0`]: {enabled: true, trusted_hash: codexHookHash('pre_tool_use', group, handler)},
  });
  assert.equal(value.shell_environment_policy.inherit, 'core');
});

test('fleet config keeps what Codex wrote and re-seeds a stale guard trust', t => {
  const placeholder = 'sha256:stale';
  const {home, value} = render(t, home => `approval_policy = "on-request"
[features]
hooks = false
[hooks.state."/elsewhere/.codex/hooks.json:session_start:0:0"]
trusted_hash = "sha256:kept"
[hooks.state."${home}/hooks.json:pre_tool_use:0:0"]
enabled = false
trusted_hash = "${placeholder}"
[projects."/fixture"]
trust_level = "trusted"
[notice]
hide_gpt5_1_migration_prompt = true
`);
  const key = `${home}/hooks.json:pre_tool_use:0:0`;
  assert.equal(value.approval_policy, 'never');
  assert.equal(value.features.hooks, true);
  assert.equal(value.projects['/fixture'].trust_level, 'trusted');
  assert.equal(value.notice.hide_gpt5_1_migration_prompt, true);
  assert.equal(value.hooks.state['/elsewhere/.codex/hooks.json:session_start:0:0'].trusted_hash, 'sha256:kept');
  assert.equal(value.hooks.state[key].enabled, true);
  assert.notEqual(value.hooks.state[key].trusted_hash, placeholder);
});

test('fleet home never manages a credential', () => {
  const files = readdirSync(new URL('../private_dot_codex-fm-workers', import.meta.url), {recursive: true});
  assert.deepEqual(files.filter(f => /auth|token|secret|credential/i.test(f)), []);
});
