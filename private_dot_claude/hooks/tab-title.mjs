#!/usr/bin/env node

/**
 * Tab Title Hook
 *
 * Notification + Stop hook that stamps the project (cwd basename) and an
 * attention glyph onto the terminal tab title via the terminalSequence
 * output field (Claude Code 2.1.141+; hooks have no /dev/tty since 2.1.139).
 *
 * While Claude works it writes its own task-summary title; this hook
 * guarantees the project name is on the tab at the moments that matter:
 *   ⏸  waiting on you (permission_prompt / agent_needs_input)
 *   ✅ done or idle (Stop / idle_prompt)
 *
 * Permission/needs-input also plays a short sound (afplay), since Ghostty's
 * per-tab visual cues are limited (ghostty-org/ghostty#10692). Set
 * CLAUDE_TAB_TITLE_SILENT=1 to disable the sound (tests do).
 *
 * Stdin is read async, not via readFileSync('/dev/stdin'): the sync read
 * intermittently throws EAGAIN when stdin is a non-blocking pipe, and this
 * hook fails open — silence, never a broken title.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ESC = '\u001b';
const BEL = '\u0007';
const SOUND = '/System/Library/Sounds/Glass.aiff';

let rawStdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawStdin += chunk; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => main(rawStdin));

function main(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const { hook_event_name: event, notification_type: type, cwd } = input ?? {};
  if (typeof cwd !== 'string' || cwd.length === 0) process.exit(0);

  let glyph;
  let sound = false;
  if (event === 'Stop') {
    glyph = '✅';
  } else if (event === 'Notification') {
    if (type === 'permission_prompt' || type === 'agent_needs_input') {
      glyph = '⏸';
      sound = true;
    } else if (type === 'idle_prompt') {
      glyph = '✅';
    }
  }
  if (!glyph) process.exit(0);

  if (sound && process.env.CLAUDE_TAB_TITLE_SILENT !== '1' && process.platform === 'darwin') {
    spawn('afplay', [SOUND], { detached: true, stdio: 'ignore' }).unref();
  }

  const title = `${glyph} ${path.basename(cwd)}`;
  process.stdout.write(JSON.stringify({ terminalSequence: `${ESC}]0;${title}${BEL}` }));
  process.exit(0);
}
