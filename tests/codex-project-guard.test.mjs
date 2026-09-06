import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const guard = fileURLToPath(new URL('../dot_local/bin/executable_codex-project-guard', import.meta.url));
function fixture(t, repo) {
  const cwd = mkdtempSync(join(tmpdir(), 'codex-project-policy-'));
  t.after(() => rmSync(cwd, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8'});
  git('init', '-q');
  git('remote', 'add', 'origin', `https://github.com/${repo}.git`);
  mkdirSync(join(cwd, '.claude/hooks'), {recursive: true});
  const name = repo.split('/')[1];
  const hook = name === 'transcoder' ? 'nextest-guard.mjs' : 'tests-are-readonly.mjs';
  copyFileSync(join(homedir(), 'Work/Git', name, '.claude/hooks', hook), join(cwd, '.claude/hooks', hook));
  const run = command => {
    const raw = execFileSync('node', [guard], {input: JSON.stringify({cwd, tool_name: 'Bash', tool_input: {command}}), encoding: 'utf8'});
    return raw ? JSON.parse(raw).hookSpecificOutput : null;
  };
  return {cwd, git, run};
}

for (const repo of ['jasonm4130-labs/transcoder', 'jasonm4130-labs/ambient', 'jasonm4130/claude-skills']) {
  test(`${repo}: interactive operations pass; bypasses stop`, t => {
    const {run} = fixture(t, repo);
    for (const cmd of ['git status', 'git commit -m normal', 'gh pr merge 42 --merge', 'gh workflow list', 'gh pr checks 42', 'gh api repos/owner/repo/actions/runs']) {
      assert.equal(run(cmd), null, cmd);
    }
    for (const cmd of ['gh pr merge 42 --admin', 'git push --force origin feature', 'git push --force-with-lease=refs/heads/feature:abc origin feature', 'git push origin +HEAD:feature', 'git commit --no-verify', 'gh workflow disable ci', 'gh api -X PUT repos/owner/repo/pulls/42/merge']) {
      assert.equal(run(cmd)?.permissionDecision, 'deny', cmd);
    }
  });
}
test('transcoder preserves narrow nextest policy and stops non-main PRs', t => {
  const {run} = fixture(t, 'jasonm4130-labs/transcoder');
  for (const cmd of ['cargo nextest run --workspace', 'cargo test --workspace --doc', 'cargo test -p transcoder-host -- --test-threads=1', 'gh pr create --base main']) assert.equal(run(cmd), null, cmd);
  for (const cmd of ['cargo test --workspace -- --test-threads=1', 'gh pr create --base feature', 'gh pr create -B feature']) assert.equal(run(cmd)?.permissionDecision, 'deny', cmd);
});
for (const repo of ['jasonm4130-labs/ambient', 'jasonm4130/claude-skills']) {
  test(`${repo}: real staged test removal stops; test additions pass`, t => {
    const {cwd, git, run} = fixture(t, repo);
    writeFileSync(join(cwd, 'example.test.js'), 'test("baseline", () => {});\n');
    git('add', 'example.test.js');
    assert.equal(run('git commit -m add-test'), null);
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
    writeFileSync(join(cwd, 'example.test.js'), '// implementation only\n');
    git('add', 'example.test.js');
    assert.equal(run('git commit -m remove-test')?.permissionDecision, 'deny');
    const redirected = execFileSync('node', [guard], {input: JSON.stringify({cwd: tmpdir(), tool_name: 'Bash', tool_input: {command: `git -C "${cwd}" commit -m remove-test`}}), encoding: 'utf8'});
    assert.equal(JSON.parse(redirected).hookSpecificOutput.permissionDecision, 'deny');
  });
}
