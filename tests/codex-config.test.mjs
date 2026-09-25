import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const source = readFileSync(new URL('../dot_codex/private_config.toml.tmpl', import.meta.url), 'utf8');
const hooks = JSON.parse(readFileSync(new URL('../dot_codex/hooks.json', import.meta.url), 'utf8'));
const work = readFileSync(new URL('../dot_codex/work.config.toml', import.meta.url), 'utf8');

function fixture(t, initial = '') {
  const dir = mkdtempSync(join(tmpdir(), 'codex-config-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'config.toml');
  writeFileSync(path, initial);
  const template = source.replace('joinPath $home ".codex/config.toml"', JSON.stringify(path))
    .replaceAll('.chezmoi.homeDir', '"/fixture-home"')
    .replaceAll('.chezmoi.workingTree', '"/fixture-home/.local/share/chezmoi"');
  return () => {
    const rendered = execFileSync('chezmoi', ['execute-template'], {input: template, encoding: 'utf8'});
    const value = JSON.parse(execFileSync('chezmoi', ['execute-template', '--with-stdin', '{{ fromToml .chezmoi.stdin | toJson }}'], {input: rendered, encoding: 'utf8'}));
    writeFileSync(path, rendered);
    return {rendered, value};
  };
}

const initial = `model = "old-model"
notify = ["native-notify", "turn-ended"]
[features]
hooks = true
memories = false
external_agent_memory_import = true
[memories]
use_memories = false
min_rollout_idle_hours = 8
[hooks.state."example"]
trusted_hash = "fixture-hash"
[projects."/fixture"]
trust_level = "trusted"
[projects."/fixture-home/Work/Git/ambient"]
trust_level = "untrusted"
[desktop]
keepRemoteControlAwakeWhilePluggedIn = false
[agents]
custom_flag = true
[mcp_servers.chrome-devtools]
command = "existing-chrome"
args = ["keep"]
[mcp_servers.cloudflare-docs]
url = "https://fixture.invalid/mcp"
[mcp_servers.computer-use]
command = "native-computer"
[mcp_servers.node_repl]
command = "native-node"
[mcp_servers.private]
command = "private-server"
[shell_environment_policy.set]
TZ = "Australia/Brisbane"
RETRO_BATCH_MIN_DAYS = "3"
BASH_DEFAULT_TIMEOUT_MS = "123"
[tui]
status_line = ["current-dir"]
[plugins."fixture@plugin"]
enabled = true
[[skills.config]]
path = "/fixture"
enabled = true
[[skills.config]]
name = "unrelated"
enabled = true
[[skills.config]]
path = "/fixture-home/.codex/skills/work-loop"
enabled = false
[[skills.config]]
path = "/fixture-home/.agents/skills/writing-artifacts"
enabled = false
[[skills.config]]
path = "/fixture-home/Work/Git/claude-skills/plugins/writing-artifacts/skills/writing-artifacts"
enabled = false
`;

function skill(config, key, expected) {
  return config.skills.config.find(entry => entry[key] === expected);
}

test('native defaults preserve runtime state and remove forced routing', t => {
  const render = fixture(t, initial);
  const first = render();
  assert.equal(first.value.model, 'gpt-6-astra');
  assert.equal(first.value.model_reasoning_effort, 'low');
  assert.equal(first.value.approvals_reviewer, 'auto_review');
  assert.deepEqual(first.value.project_doc_fallback_filenames, []);
  assert.equal(first.value.features.memories, true);
  assert.equal(first.value.features.prevent_idle_sleep, true);
  assert.equal(first.value.features.external_agent_memory_import, true);
  assert.equal(first.value.memories.min_rate_limit_remaining_percent, 25);
  assert.equal(first.value.hooks.state.example.trusted_hash, 'fixture-hash');
  assert.equal(first.value.projects['/fixture'].trust_level, 'trusted');
  assert.equal(first.value.desktop.keepRemoteControlAwakeWhilePluggedIn, false);
  assert.equal(first.value.agents.custom_flag, true);
  assert.equal(first.value.shell_environment_policy.set.TZ, 'Australia/Brisbane');
  assert.equal(first.value.shell_environment_policy.set.RETRO_BATCH_MIN_DAYS, '3');
  assert.equal(first.value.shell_environment_policy.set.BASH_DEFAULT_TIMEOUT_MS, '123');
  assert.deepEqual(first.value.notify, ['native-notify', 'turn-ended']);
  assert.equal(skill(first.value, 'path', '/fixture').enabled, true);
  assert.equal(skill(first.value, 'name', 'unrelated').enabled, true);
  assert.deepEqual(first.value.tui.status_line, ['current-dir']);
  assert.equal(first.value.plugins['fixture@plugin'].enabled, true);
  assert.equal(render().rendered, first.rendered);
});

test('custom MCPs are kept unless explicitly disabled; native app MCPs untouched', t => {
  const {value} = fixture(t, initial)();
  assert.deepEqual(value.mcp_servers['chrome-devtools'].args, ['keep']);
  assert.equal(value.mcp_servers['cloudflare-docs'].url, 'https://fixture.invalid/mcp');
  assert.equal(value.mcp_servers['computer-use'].command, 'native-computer');
  assert.equal(value.mcp_servers.node_repl.command, 'native-node');
  assert.equal(value.mcp_servers.private.command, 'private-server');
  assert.equal(value.mcp_servers.openaiDeveloperDocs, undefined);
  assert.equal(value.mcp_servers.social, undefined);
});

test('a new config does not seed custom MCPs', t => {
  const {value} = fixture(t)();
  assert.deepEqual(value.mcp_servers, {});
});

test('stale skill disables are dropped while unrelated skill config and Herdr lifecycle remain', t => {
  const {value} = fixture(t, initial)();
  const configured = value.skills.config.filter(entry => entry.name);
  assert.deepEqual(configured.map(entry => entry.name), ['unrelated']);
  assert.equal(skill(value, 'name', 'unrelated').enabled, true);
  assert.equal(skill(value, 'path', '/fixture').enabled, true);
  assert.deepEqual(value.skills.config.filter(entry => entry.path).map(entry => entry.path), ['/fixture']);
  assert.deepEqual(Object.keys(hooks.hooks), ['SessionStart']);
  assert.equal(hooks.hooks.SessionStart[0].hooks[0].command, "bash '/Users/jasonmatthew/.codex/herdr-agent-state.sh' session");
  assert.equal(hooks.hooks.SessionStart[0].hooks[0].timeout, 10);
  assert.doesNotMatch(work, /\[agents\]|work-loop skill|orchestrator/);
  assert.match(work, /HERDR_ENV=1/);
});

test('a config without skill entries renders no skills table', t => {
  const {value} = fixture(t, '[[skills.config]]\nname = "work-loop"\nenabled = false\n')();
  assert.equal(value.skills, undefined);
});
