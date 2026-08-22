import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOADER_PATH = path.join(__dirname, '..', 'dot_config', 'private_op', 'load-env.zsh');

// Every "secret" below is a fixture invented for this file. The stub op-fast
// never talks to 1Password — the loader is exercised entirely against a fake
// $HOME with a fake binary on PATH, so a failing assertion can never print a
// real credential.
const SENTINEL = 'INJECTED';

// The file under test is zsh, and the CI matrix includes ubuntu runners whose
// shell inventory is not this repo's to control. Skip rather than fail there —
// the macOS legs of the same matrix are the ones that mirror the real machine.
const zshOnly = spawnSync('zsh', ['-f', '-c', 'exit 0']).status === 0
  ? {}
  : { skip: 'zsh is not installed on this machine' };

/**
 * Build a throwaway $HOME containing the loader, an env.tmpl, and a stub
 * `op-fast` on PATH that emits `payload` verbatim and exits `exitCode`.
 * Every call is tallied so the once-per-process guard can be asserted.
 */
function makeSandbox(payload, { exitCode = 0, withTemplate = true, withOpFast = true } = {}) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'load-env-test-'));
  const opDir = path.join(home, '.config', 'op');
  const binDir = path.join(home, 'bin');
  mkdirSync(opDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  copyFileSync(LOADER_PATH, path.join(opDir, 'load-env.zsh'));
  if (withTemplate) writeFileSync(path.join(opDir, 'env.tmpl'), 'IRRELEVANT=op://Fake/item/field\n');

  const callsFile = path.join(home, 'calls');
  const payloadFile = path.join(home, 'payload');
  writeFileSync(payloadFile, payload);
  if (withOpFast) {
    // Args are ignored on purpose: the loader's contract with op-fast is
    // "stdout is the injected file, exit status says whether it worked".
    writeFileSync(
      path.join(binDir, 'op-fast'),
      `#!/bin/sh\nprintf 'x\\n' >> '${callsFile}'\ncat '${payloadFile}'\nexit ${exitCode}\n`,
      { mode: 0o755 },
    );
  }
  return { home, binDir, callsFile, touched: path.join(home, 'touched') };
}

/**
 * Source the loader in a fresh zsh and report what landed in the environment.
 * `names` are dumped NUL-separated to a file so values containing quotes,
 * newlines or `=` survive the trip back to node; a name absent from the
 * returned Map was never set.
 */
function runLoader(sandbox, { names = [], interactive = false, extra = '', xtrace = false } = {}) {
  const varsOut = path.join(sandbox.home, 'vars.out');
  const driver = path.join(sandbox.home, 'driver.zsh');
  writeFileSync(
    driver,
    [
      'source "$HOME/.config/op/load-env.zsh"',
      extra,
      // The dump itself must never be traced — under `zsh -x` it would print
      // every value to stderr and make the no-leak assertion vacuous.
      'set +x',
      `_names=(${names.join(' ')})`,
      `{ for _n in $_names; do (( \${+parameters[$_n]} )) && printf '%s\\0%s\\0' "$_n" "\${(P)_n}"; done } > '${varsOut}'`,
      '',
    ].join('\n'),
  );

  const args = ['-f'];
  if (interactive) args.push('-i');
  if (xtrace) args.push('-x');
  args.push(driver);

  const res = spawnSync('zsh', args, {
    encoding: 'utf8',
    env: { PATH: `${sandbox.binDir}:/usr/bin:/bin`, HOME: sandbox.home, TERM: 'dumb' },
  });

  const vars = new Map();
  if (existsSync(varsOut)) {
    const parts = readFileSync(varsOut, 'utf8').split('\0');
    for (let i = 0; i + 1 < parts.length; i += 2) vars.set(parts[i], parts[i + 1]);
  }
  const calls = existsSync(sandbox.callsFile)
    ? readFileSync(sandbox.callsFile, 'utf8').split('\n').filter(Boolean).length
    : 0;
  return { ...res, vars, calls };
}

// --- Values reach the environment byte-for-byte, whatever they contain ---

test('a value containing $$ survives literally (not replaced by the PID)', zshOnly, () => {
  const s = makeSandbox('PID_TEST=lit$$eral\n');
  const { vars } = runLoader(s, { names: ['PID_TEST'] });
  assert.equal(vars.get('PID_TEST'), 'lit$$eral');
});

test('an unbalanced " survives and does not abort the exports after it', zshOnly, () => {
  const s = makeSandbox('BROKEN=say "hello\nAFTER=later\n');
  const { vars, stderr } = runLoader(s, { names: ['BROKEN', 'AFTER'] });
  assert.equal(vars.get('BROKEN'), 'say "hello');
  assert.equal(vars.get('AFTER'), 'later', 'exports after the bad value must still land');
  assert.ok(!stderr.includes('unmatched'), `no parse error expected, got: ${stderr}`);
});

test('a value containing shell metacharacters is data, not code', zshOnly, () => {
  // Three shapes that all executed under the old `eval` of the injected blob:
  // a bare command list, a quote breakout, and a command substitution.
  const s = makeSandbox(
    `EVIL=; echo ${SENTINEL};\n` +
      `EVIL_BREAK=x"; echo ${SENTINEL}; echo "y\n` +
      `EVIL_SUB=\`touch ${'${HOME}'}/touched\`\n`,
  );
  const { vars, stdout, stderr } = runLoader(s, { names: ['EVIL', 'EVIL_BREAK', 'EVIL_SUB'] });
  assert.equal(vars.get('EVIL'), `; echo ${SENTINEL};`);
  assert.equal(vars.get('EVIL_BREAK'), `x"; echo ${SENTINEL}; echo "y`);
  assert.equal(vars.get('EVIL_SUB'), '`touch ${HOME}/touched`');
  assert.ok(!stdout.includes(SENTINEL), `command substitution ran: ${stdout}`);
  assert.ok(!stderr.includes(SENTINEL), `command substitution ran: ${stderr}`);
  assert.equal(existsSync(s.touched), false, 'backticked command must not execute');
});

test('only the first = is the separator', zshOnly, () => {
  const s = makeSandbox('EQ_TEST=a=b=c\nEQ_EMPTY=\n');
  const { vars } = runLoader(s, { names: ['EQ_TEST', 'EQ_EMPTY'] });
  assert.equal(vars.get('EQ_TEST'), 'a=b=c');
  assert.equal(vars.get('EQ_EMPTY'), '');
});

test('spaces, quotes and $ in one payload all survive together', zshOnly, () => {
  const s = makeSandbox('SPACED=two words\nSQ=it\'s $HOME "quoted"\n');
  const { vars } = runLoader(s, { names: ['SPACED', 'SQ'] });
  assert.equal(vars.get('SPACED'), 'two words');
  assert.equal(vars.get('SQ'), 'it\'s $HOME "quoted"');
});

test('blank lines and env.tmpl comments are skipped, not exported', zshOnly, () => {
  const s = makeSandbox('REAL=yes\n\n# export COMMENTED="no"\nnot a key line\n');
  const { vars } = runLoader(s, { names: ['REAL', 'COMMENTED'] });
  assert.equal(vars.get('REAL'), 'yes');
  assert.equal(vars.has('COMMENTED'), false);
});

// --- The warning branch stays reachable ---

test('op-fast failing with empty output warns in an interactive shell', zshOnly, () => {
  const s = makeSandbox('', { exitCode: 1 });
  const { stderr } = runLoader(s, { interactive: true });
  assert.ok(stderr.includes('1Password not loaded'), `expected the warning, got: ${stderr}`);
  assert.ok(stderr.includes('op-env-reload'), 'the warning must name the recovery hatch');
});

test('the same failure is silent in a non-interactive shell', zshOnly, () => {
  const s = makeSandbox('', { exitCode: 1 });
  const { stderr } = runLoader(s);
  assert.ok(!stderr.includes('1Password not loaded'), `expected silence, got: ${stderr}`);
});

// --- Once per process, and silent when there is nothing to do ---

test('sourcing twice in one process invokes op-fast exactly once', zshOnly, () => {
  const s = makeSandbox('GUARD_TEST=once\n');
  const { calls, vars } = runLoader(s, {
    names: ['GUARD_TEST'],
    extra: 'source "$HOME/.config/op/load-env.zsh"',
  });
  assert.equal(calls, 1);
  assert.equal(vars.get('GUARD_TEST'), 'once');
});

test('op-env-reload clears the guard and re-injects', zshOnly, () => {
  const s = makeSandbox('GUARD_TEST=once\n');
  const { calls } = runLoader(s, { extra: 'op-env-reload' });
  assert.equal(calls, 2);
});

test('no op-fast on PATH → silent no-op', zshOnly, () => {
  const s = makeSandbox('X=y\n', { withOpFast: false });
  const { status, stdout, stderr } = runLoader(s, { interactive: true });
  assert.equal(status, 0);
  assert.equal(stdout, '');
  assert.equal(stderr, '');
});

test('no env.tmpl → silent no-op, op-fast never called', zshOnly, () => {
  const s = makeSandbox('X=y\n', { withTemplate: false });
  const { status, stderr, calls } = runLoader(s, { interactive: true });
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(calls, 0);
});

// --- xtrace must not turn `zsh -x -i` into a secret dump ---

test('zsh -x does not trace secret values, and xtrace is restored', zshOnly, () => {
  const s = makeSandbox('TRACED=fixture-value-not-a-real-secret\n');
  const { vars, stderr } = runLoader(s, {
    names: ['TRACED'],
    xtrace: true,
    extra: '[[ -o xtrace ]] && print -u2 -r -- XTRACE_STILL_ON',
  });
  assert.equal(vars.get('TRACED'), 'fixture-value-not-a-real-secret');
  assert.ok(!stderr.includes('fixture-value-not-a-real-secret'), 'xtrace leaked the value to stderr');
  assert.ok(stderr.includes('XTRACE_STILL_ON'), 'xtrace must be restored after the sensitive block');
});

// --- The loader leaves no scratch state behind ---

test('scratch variables are cleaned up and not exported', zshOnly, () => {
  const s = makeSandbox('KEEP=me\n');
  const { vars } = runLoader(s, { names: ['KEEP', '_op_env', '_op_line', '_op_xtrace'] });
  assert.equal(vars.get('KEEP'), 'me');
  assert.equal(vars.has('_op_env'), false);
  assert.equal(vars.has('_op_line'), false);
  assert.equal(vars.has('_op_xtrace'), false);
});
