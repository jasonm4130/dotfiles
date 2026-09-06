import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const source = readFileSync(new URL('../dot_codex/private_config.toml.tmpl', import.meta.url), 'utf8');

function fixture(t, initial) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-config-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'config.toml');
  if (initial !== undefined) writeFileSync(path, initial);
  const template = source.replace('joinPath .chezmoi.homeDir ".codex/config.toml"', JSON.stringify(path));
  return () => {
    const rendered = execFileSync('chezmoi', ['execute-template'], {input: template, encoding: 'utf8'});
    const value = JSON.parse(execFileSync('chezmoi', ['execute-template', '--with-stdin', '{{ fromToml .chezmoi.stdin | toJson }}'], {input: rendered, encoding: 'utf8'}));
    writeFileSync(path, rendered);
    return {rendered, value};
  };
}

test('new config enables native memory with quota reserve', t => {
  const {value} = fixture(t)();
  assert.equal(value.features.memories, true);
  assert.deepEqual(value.memories, {generate_memories: true, use_memories: true, min_rate_limit_remaining_percent: 25});
  assert.equal(value.features.external_agent_memory_import, undefined);
  assert.ok(value.tui.status_line.includes('weekly-limit'));
});

test('memory defaults preserve runtime state and render idempotently', t => {
  const render = fixture(t, `model = "old-model"
[features]
hooks = true
memories = false
[memories]
use_memories = false
min_rate_limit_remaining_percent = 5
min_rollout_idle_hours = 8
[hooks.state."example"]
trusted_hash = "fixture-hash"
[projects."/fixture"]
trust_level = "trusted"
[tui]
status_line = ["current-dir"]
[tui.model_availability_nux]
example = 4
`);
  const first = render();
  assert.equal(first.value.model, 'gpt-6-astra');
  assert.equal(first.value.features.hooks, true);
  assert.equal(first.value.memories.min_rollout_idle_hours, 8);
  assert.equal(first.value.memories.min_rate_limit_remaining_percent, 25);
  assert.equal(first.value.hooks.state.example.trusted_hash, 'fixture-hash');
  assert.equal(first.value.projects['/fixture'].trust_level, 'trusted');
  assert.deepEqual(first.value.tui.status_line, ['current-dir']);
  assert.equal(first.value.tui.model_availability_nux.example, 4);
  assert.equal(render().rendered, first.rendered);
});
