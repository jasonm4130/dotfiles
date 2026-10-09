/**
 * Guards the Firstmate fleet profile (~/.claude-fm-workers) where it deliberately
 * differs from the personal one.
 *
 *  1. Its CLAUDE.md is classifier input for every unattended session. The personal
 *     "Confirm before ... deleting or overwriting anything" must not reach it, and
 *     everything else in the personal instructions must.
 *  2. The docs-sync narrowing hook must stay silent outside a plugin monorepo and
 *     hand the payload to the gates plugin's own script inside one, with docs-sync
 *     re-enabled and every other disabled gate kept off.
 *  3. Supervisor merge rules must not come back into the store every worker reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');
const hook = path.join(repoRoot, 'private_dot_claude-fm-workers/hooks/executable_docs-sync-plugins-only.sh');

test('fm-workers CLAUDE.md is the personal file with the Actions section swapped', () => {
  const rendered = execFileSync('chezmoi', ['execute-template', '--source', repoRoot], {
    input: read('private_dot_claude-fm-workers/CLAUDE.md.tmpl'),
    encoding: 'utf8',
  });
  assert.doesNotMatch(rendered, /Confirm before/);
  assert.doesNotMatch(rendered, /^@~\//m, 'an @-import would bring the personal Actions back');
  assert.ok(rendered.includes(read('.chezmoitemplates/fm-workers-actions.md')));

  // Every personal section except Actions arrives verbatim.
  const agents = read('dot_codex/AGENTS.md').replace(/## Actions\n[\s\S]*?\n## /, '## ');
  for (const section of agents.split(/\n(?=## )/).slice(1)) {
    assert.ok(rendered.includes(section.trim()), `missing personal section: ${section.split('\n')[0]}`);
  }
  const claudeOnly = read('private_dot_claude/CLAUDE.md').replace(/^@~\/\.codex\/AGENTS\.md\n+/, '');
  assert.ok(rendered.includes(claudeOnly.trim()));
});

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fm-docs-sync-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // A stand-in for the gates plugin: echoes what the real script would receive.
  const plugin = path.join(dir, 'gates');
  mkdirSync(path.join(plugin, 'scripts'), { recursive: true });
  writeFileSync(
    path.join(plugin, 'scripts/pretooluse-guard-docs-sync.mjs'),
    "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify({disable:process.env.GATES_DISABLE,cwd:JSON.parse(s).cwd})));",
  );
  const config = path.join(dir, 'config');
  mkdirSync(path.join(config, 'plugins'), { recursive: true });
  writeFileSync(
    path.join(config, 'plugins/installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'gates@jasonm4130-claude-skills': [{ installPath: plugin }] } }),
  );
  const repo = (name, monorepo) => {
    const root = path.join(dir, name);
    mkdirSync(root);
    execFileSync('git', ['init', '-q', root]);
    if (monorepo) {
      mkdirSync(path.join(root, '.claude-plugin'));
      writeFileSync(path.join(root, '.claude-plugin/marketplace.json'), '{}');
      mkdirSync(path.join(root, 'plugins'));
    }
    return root;
  };
  const run = (cwd, command, gatesDisable = 'docs-sync') =>
    spawnSync('bash', [hook], {
      input: JSON.stringify({ tool_name: 'Bash', cwd, tool_input: { command } }),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: dir, CLAUDE_CONFIG_DIR: config, GATES_DISABLE: gatesDisable },
    });
  return { repo, run, dir };
}

test('docs-sync hook stays silent outside a plugin monorepo', (t) => {
  const { repo, run } = fixture(t);
  const project = repo('project', false);
  const r = run(project, 'git commit -m x');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('docs-sync hook runs the plugin gate in a plugin monorepo, other gates still off', (t) => {
  const { repo, run } = fixture(t);
  const mono = repo('mono', true);
  const r = run(mono, 'git commit -m x', 'agent-model, docs-sync,workflow-model');
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { disable: 'agent-model,workflow-model', cwd: mono });
});

test('docs-sync hook ignores non-commit commands and fails open without the plugin', (t) => {
  const { repo, run, dir } = fixture(t);
  const mono = repo('mono', true);
  assert.equal(run(mono, 'ls -la').stdout, '');
  rmSync(path.join(dir, 'config'), { recursive: true });
  const r = run(mono, 'git commit -m x');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('fm-workers settings: no supervisor merge rules, attended force paths in both stores', () => {
  const workers = JSON.parse(read('private_dot_claude-fm-workers/settings.json'));
  const personal = JSON.parse(read('private_dot_claude/settings.json'));
  assert.deepEqual(workers.permissions.allow.filter((r) => r.includes('fm-pr-merge')), []);
  for (const store of [workers, personal]) {
    assert.ok(store.permissions.ask.includes('Bash(*fm-pr-merge.sh*--allow-red*)'));
    assert.ok(store.permissions.ask.includes('Bash(*fm-teardown.sh*--force*)'));
    assert.equal(store.autoMode.environment[0], '$defaults');
    assert.equal(store.autoMode.allow[0], '$defaults');
    for (const key of ['OTEL_LOG_TOOL_DETAILS', 'OTEL_LOG_USER_PROMPTS', 'OTEL_LOG_TOOL_CONTENT', 'OTEL_LOG_RAW_API_BODIES']) {
      assert.equal(store.env[key], undefined, `${key} would export commands or content`);
    }
  }
});
