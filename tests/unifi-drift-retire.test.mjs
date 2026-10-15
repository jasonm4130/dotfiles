/**
 * run_onchange_after_22 retires the Mac's UniFi drift LaunchAgent, which the
 * unifi repo installed by hand, now that dell-01 runs the check. It must unload
 * the job and delete its plist, and must be a no-op on a machine that never had
 * it, because chezmoi runs it once on every machine.
 *
 * SAFETY: every run gets a throwaway HOME and a stub launchctl that only logs
 * its arguments, so nothing touches the real launchd domain.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(repoRoot, 'run_onchange_after_22-launchd-unifi-drift-retire.sh');
const LABEL = 'dev.jasonmatthew.unifi-drift';

function setup(t, { installed, loaded }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'unifi-drift-retire-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home');
  const agents = path.join(home, 'Library/LaunchAgents');
  mkdirSync(agents, { recursive: true });
  const plist = path.join(agents, `${LABEL}.plist`);
  if (installed) writeFileSync(plist, '<plist/>\n');

  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  const log = path.join(dir, 'launchctl.log');
  writeFileSync(log, '');
  // `print` succeeds only while the job is "loaded", as the real one does.
  writeFileSync(path.join(bin, 'launchctl'), `#!/bin/sh
echo "$*" >> "${log}"
if [ "$1" = print ]; then ${loaded ? 'exit 0' : 'exit 113'}; fi
exit 0
`);
  chmodSync(path.join(bin, 'launchctl'), 0o755);

  const run = () => spawnSync('bash', [SCRIPT], {
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: home },
    encoding: 'utf8',
  });
  return { plist, run, calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
}

test('boots out a loaded job and deletes its plist', (t) => {
  const { plist, run, calls } = setup(t, { installed: true, loaded: true });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(calls().some((c) => c.startsWith('bootout ') && c.endsWith(`/${LABEL}`)), calls().join('\n'));
  assert.equal(existsSync(plist), false);
});

test('deletes an installed plist whose job is not loaded, without a bootout', (t) => {
  const { plist, run, calls } = setup(t, { installed: true, loaded: false });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!calls().some((c) => c.startsWith('bootout ')), calls().join('\n'));
  assert.equal(existsSync(plist), false);
});

test('is a no-op on a machine that never had the job', (t) => {
  const { run, calls } = setup(t, { installed: false, loaded: false });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!calls().some((c) => c.startsWith('bootout ')), calls().join('\n'));
});
