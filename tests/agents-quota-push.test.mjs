/**
 * Guards the ships-log phase 1 quota path: claude-statusline-tee keeps the
 * status-line JSON that carries rate_limits, and agents-quota-push turns it and
 * codex-usage into OTLP gauges. Both run against a throwaway state dir, a stub
 * status line, a stub codex-usage and a local HTTP receiver, so nothing here
 * reaches brok or Codex.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const binDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dot_local', 'bin');
const TEE = path.join(binDir, 'executable_claude-statusline-tee');
const PUSH = path.join(binDir, 'executable_agents-quota-push');

const now = () => Math.floor(Date.now() / 1000);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

function sandbox(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'agents-quota-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function statusJson(rateLimits) {
  return JSON.stringify({ session_id: 'fixture', model: { display_name: 'Fixture' },
    ...(rateLimits ? { rate_limits: rateLimits } : {}) });
}

function runTee(dir, input) {
  const stub = path.join(dir, 'statusline-stub');
  writeFileSync(stub, '#!/usr/bin/env bash\nprintf "line:%s" "$(wc -c | tr -d " ")"\n', { mode: 0o755 });
  return spawnSync('bash', [TEE], { input, encoding: 'utf8',
    env: { ...process.env, SHIPS_LOG_STATE_DIR: path.join(dir, 'state'), CLAUDE_STATUSLINE_BIN: stub } });
}

test('tee snapshots a status line carrying rate_limits and passes it through', (t) => {
  const dir = sandbox(t);
  const input = statusJson({ five_hour: { used_percentage: 23.5, resets_at: now() + 600 } });
  const result = runTee(dir, input);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^line:\d+$/, 'the real status line still renders');
  assert.equal(readFileSync(path.join(dir, 'state', 'claude-statusline.json'), 'utf8'), input);
});

test('tee keeps the last good snapshot when rate_limits is absent', (t) => {
  const dir = sandbox(t);
  const good = statusJson({ seven_day: { used_percentage: 41.2, resets_at: now() + 600 } });
  runTee(dir, good);
  const result = runTee(dir, statusJson(null));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^line:\d+$/);
  assert.equal(readFileSync(path.join(dir, 'state', 'claude-statusline.json'), 'utf8'), good);
});

/** Local OTLP receiver; resolves to { url, bodies, close }. */
async function receiver(t, status = 200) {
  const bodies = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { bodies.push({ url: req.url, type: req.headers['content-type'], body: JSON.parse(body) });
      res.writeHead(status); res.end('{}'); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}/v1/metrics`, bodies };
}

function codexStub(dir, windows) {
  const calls = path.join(dir, 'codex-calls');
  const stub = path.join(dir, 'codex-usage-stub');
  const out = JSON.stringify({ observedAt: new Date().toISOString(), windows });
  writeFileSync(stub, `#!/usr/bin/env node\nrequire('fs').appendFileSync(${JSON.stringify(calls)}, 'x');\nconsole.log(${JSON.stringify(out)});\n`, { mode: 0o755 });
  return { stub, calls: () => (existsSync(calls) ? readFileSync(calls, 'utf8').length : 0) };
}

function runPush(dir, endpoint, codex, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [PUSH], { env: { ...process.env,
      AGENTS_OTLP_ENDPOINT: endpoint, SHIPS_LOG_STATE_DIR: path.join(dir, 'state'),
      CODEX_USAGE_BIN: codex.stub, ...extra } });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

/** Flatten an OTLP JSON body into { 'metric{provider,window,bucket}': value }. */
function gauges(body) {
  const out = {};
  for (const rm of body.resourceMetrics) {
    for (const sm of rm.scopeMetrics) {
      for (const m of sm.metrics) {
        for (const p of m.gauge.dataPoints) {
          const a = Object.fromEntries(p.attributes.map((x) => [x.key, x.value.stringValue]));
          assert.equal(a.host, 'mac');
          out[`${m.name}{${a.provider},${a.window},${a.bucket}}`] = p.asDouble;
        }
      }
    }
  }
  return out;
}

const codexWeekly = (used) => [{ bucket: 'codex', window: 'primary', usedPercent: used, remainingPercent: 100 - used,
  durationMinutes: 10080, resetsAt: new Date((now() + 86400) * 1000).toISOString() }];

test('pusher sends Claude and Codex limit gauges over OTLP/HTTP JSON', async (t) => {
  const dir = sandbox(t);
  const rx = await receiver(t);
  const resets = now() + 3600;
  runTee(dir, statusJson({ five_hour: { used_percentage: 23.5, resets_at: resets },
    seven_day: { used_percentage: 41.2, resets_at: resets } }));
  const codex = codexStub(dir, codexWeekly(12));

  const result = await runPush(dir, rx.url, codex);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '', 'a clean run prints nothing');
  assert.equal(rx.bodies.length, 1);
  assert.equal(rx.bodies[0].url, '/v1/metrics');
  assert.equal(rx.bodies[0].type, 'application/json');
  const g = gauges(rx.bodies[0].body);
  near(g['agents_plan_used_ratio{claude,five_hour,claude}'], 0.235);
  near(g['agents_plan_used_ratio{claude,seven_day,claude}'], 0.412);
  near(g['agents_plan_used_ratio{codex,weekly,codex}'], 0.12);
  assert.equal(g['agents_plan_resets_at_seconds{claude,five_hour,claude}'], resets);
  assert.ok(g['agents_plan_observed_at_seconds{codex,weekly,codex}'] > 0);
});

test('pusher remembers a window the status line dropped, and zeroes it once reset', async (t) => {
  const dir = sandbox(t);
  const rx = await receiver(t);
  const codex = codexStub(dir, codexWeekly(5));
  runTee(dir, statusJson({ five_hour: { used_percentage: 80, resets_at: now() + 2 },
    seven_day: { used_percentage: 50, resets_at: now() + 3600 } }));
  await runPush(dir, rx.url, codex);

  // Claude drops five_hour from the status line after it resets.
  await new Promise((r) => setTimeout(r, 2500));
  runTee(dir, statusJson({ seven_day: { used_percentage: 51, resets_at: now() + 3600 } }));
  const result = await runPush(dir, rx.url, codex);
  assert.equal(result.status, 0, result.stderr);
  const g = gauges(rx.bodies.at(-1).body);
  assert.equal(g['agents_plan_used_ratio{claude,five_hour,claude}'], 0);
  near(g['agents_plan_used_ratio{claude,seven_day,claude}'], 0.51);
});

test('pusher polls codex-usage only once per poll interval', async (t) => {
  const dir = sandbox(t);
  const rx = await receiver(t);
  const codex = codexStub(dir, codexWeekly(30));
  await runPush(dir, rx.url, codex);
  await runPush(dir, rx.url, codex);
  assert.equal(codex.calls(), 1);
  // The remembered reading is still pushed between polls.
  near(gauges(rx.bodies.at(-1).body)['agents_plan_used_ratio{codex,weekly,codex}'], 0.3);
  await runPush(dir, rx.url, codex, { CODEX_POLL_SECONDS: '0' });
  assert.equal(codex.calls(), 2);
});

test('pusher logs an unreachable receiver once, then recovery once', async (t) => {
  const dir = sandbox(t);
  const codex = codexStub(dir, codexWeekly(1));
  const dead = 'http://127.0.0.1:9/v1/metrics';
  const first = await runPush(dir, dead, codex);
  assert.equal(first.status, 0);
  assert.match(first.stderr, /agents-quota-push: /);
  const second = await runPush(dir, dead, codex);
  assert.equal(second.stderr, '', 'an unchanged error is not repeated');

  const rx = await receiver(t);
  const third = await runPush(dir, rx.url, codex);
  assert.match(third.stderr, /recovered/);
  assert.equal(rx.bodies.length, 1);
});
