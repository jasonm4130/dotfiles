/**
 * Guards homelab-guard.sh, the PreToolUse hook that keeps fleet workers off the LAN.
 *
 * It judges what a command runs, not the prose it carries: heredoc bodies, quoted
 * echo/printf text and lookups (which, command -v, --version) are dropped before the
 * match, unless what is left hands text to an interpreter. Both directions matter: a
 * loosening that lets `ssh brok` or `ansible-playbook site.yml` through is a real
 * homelab action by an unattended worker, and a false positive stops a worker that
 * only wrote a PR note mentioning brok.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('../private_dot_claude-fm-workers/hooks/executable_homelab-guard.sh', import.meta.url));
const guard = (command) =>
  spawnSync('bash', [hook], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });

const blocked = {
  'ssh to brok': 'ssh -o BatchMode=yes root@brok true',
  'ssh to a Dell alias': 'cd /tmp && ssh fm-dell02 uptime',
  'scp to the LAN': 'scp notes.txt root@192.168.5.10:/tmp/',
  'curl to a homelab host': 'curl -sS https://ships-log.jasonmatthew.me/api/',
  'an ansible-playbook run': 'cd nodes && ansible-playbook tests/render-compose.yml -e out=/tmp/x',
  'a live play': 'ansible-playbook -i inventory.yml site.yml --limit dell-01',
  'a lookup chained to a real run': 'which ansible-playbook && ansible-playbook site.yml',
  'a --version chained to a real run': 'ansible-playbook --version; ansible-playbook site.yml',
  'a chained syntax check': 'cd nodes && ansible-playbook site.yml --syntax-check | tail -3',
  'command without -v runs the tool': 'command ssh brok uptime',
  'a heredoc piped to bash': "cat <<'EOF' | bash\nssh brok uptime\nEOF",
  'a heredoc fed to bash': 'bash <<EOF\nssh root@192.168.5.10 true\nEOF',
  // The match needs the tool at a word start, so these put it after `; ` (a tool right
  // after a quote, `'ssh ...`, was never matched); what they test is that text an
  // interpreter runs is not stripped.
  'a heredoc fed to python': "python3 - <<'EOF'\nimport os; os.system('cd /tmp; ssh brok true')\nEOF",
  'a heredoc written then run': "cat > x.sh <<'EOF'\nssh brok true\nEOF\nsh x.sh",
  'a real command after a heredoc': "cat > notes.md <<'EOF'\nnotes\nEOF\nssh brok true",
  'ssh on the heredoc line itself': "ssh brok bash -s <<'EOF'\nuptime\nEOF",
  'an unterminated heredoc': "cat <<'EOF'\nssh brok true",
  'echo piped to a shell': "echo 'cd /tmp; ssh brok uptime' | sh",
  'a substitution inside echo text': 'echo "uptime: $(ssh brok uptime)"',
  'a backtick inside echo text': 'echo "uptime: `ssh brok uptime`"',
  'printf then a real command': "printf '%s\\n' done; ssh dell-01 true",
};

const allowed = {
  'a PR note in a heredoc': "D=/tmp/x; cat > $D/pr-notes.md <<'EOF'\n## Deploy notes\n- Merging redeploys ships-log on brok via ansible-playbook site.yml\nEOF",
  'a PR body via $(cat <<EOF)': "gh pr create --title t --body \"$(cat <<'EOF'\nRun ssh brok uptime after merge.\nEOF\n)\"",
  'a <<- heredoc with a tab-indented end': "cat > n.md <<-EOF\n\tssh brok\n\tEOF",
  'a status line naming ansible': 'echo "done [at=1791702913]: ansible render not run locally on dell-01" >> state/x.status',
  'a status line with a date substitution': 'S=state/x.status; echo "resolved [at=$(date +%s)]: redeploy to brok queued" >> $S',
  'printf of quoted text': "printf '%s\\n' 'ssh brok uptime' > notes.txt",
  'which lookups': 'which docker ansible-playbook ansible-galaxy uv 2>&1; docker context ls',
  'command -v lookup': 'command -v ansible-playbook || ls ~/.local/bin/ansible-playbook',
  'a --version lookup': 'which ansible-playbook ansible-lint 2>&1; ansible --version 2>&1 | head -2',
  'an offline syntax check': 'ansible-playbook site.yml --syntax-check',
  'plain repo work': 'git status && grep -rn brok nodes/README.md',
};

for (const [name, command] of Object.entries(blocked)) {
  test(`homelab-guard blocks ${name}`, () => {
    const r = guard(command);
    assert.equal(r.status, 2, `expected a block for: ${command}`);
    assert.match(r.stderr, /homelab-guard/);
  });
}

for (const [name, command] of Object.entries(allowed)) {
  test(`homelab-guard allows ${name}`, () => {
    const r = guard(command);
    assert.equal(r.status, 0, `expected no block for: ${command}\n${r.stderr}`);
  });
}
