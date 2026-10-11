// vault-autosync-helper: the one binary granted Full Disk Access so the
// dev.jasonmatthew.vault-autosync launchd agent can reach the TCC-protected
// ~/Documents/Main. Granting /bin/bash instead would hand every bash script on
// the machine the same access; this grants exactly one fixed script.
//
// It takes no arguments and reads no path from its environment: the script
// path and HOME are compiled in (run_onchange_after_21 passes -DSYNC_HOME), and
// the script runs with a fixed environment, so the VAULT_SYNC_* test overrides
// can never point it at anything else.
//
// It spawns and waits rather than exec'ing. TCC checks the code signature of
// the responsible process, and launchd makes this process responsible for its
// children; exec would turn this process into bash and lose the grant.
#include <errno.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

#ifndef SYNC_HOME
#error "build with -DSYNC_HOME='\"/Users/<you>\"'"
#endif

#define SYNC_SCRIPT SYNC_HOME "/.local/bin/vault-autosync.sh"
#define SYNC_PATH "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

// Pass through only the session identity launchd sets; none of these can
// redirect the script.
static const char *passthrough[] = {"USER", "LOGNAME", "TMPDIR"};

int main(int argc, char **argv) {
  (void)argv;
  if (argc > 1) {
    fprintf(stderr, "vault-autosync-helper: takes no arguments\n");
    return 64;
  }

  // Anyone who can rewrite the script inherits the grant, so refuse one that
  // is not ours alone.
  struct stat st;
  if (stat(SYNC_SCRIPT, &st) != 0) {
    fprintf(stderr, "vault-autosync-helper: %s: %s\n", SYNC_SCRIPT, strerror(errno));
    return 66;
  }
  if (st.st_uid != getuid() || (st.st_mode & (S_IWGRP | S_IWOTH))) {
    fprintf(stderr, "vault-autosync-helper: refusing %s: not owned by this user or writable by others\n",
            SYNC_SCRIPT);
    return 77;
  }

  static char envbuf[3][1024];
  char *env[3 + 4] = {"HOME=" SYNC_HOME, "PATH=" SYNC_PATH, "LANG=en_US.UTF-8"};
  int n = 3;
  for (size_t i = 0; i < sizeof passthrough / sizeof *passthrough; i++) {
    const char *v = getenv(passthrough[i]);
    if (v && snprintf(envbuf[i], sizeof envbuf[i], "%s=%s", passthrough[i], v) < (int)sizeof envbuf[i]) {
      env[n++] = envbuf[i];
    }
  }
  env[n] = NULL;

  char *const args[] = {SYNC_SCRIPT, NULL};
  pid_t pid;
  int rc = posix_spawn(&pid, SYNC_SCRIPT, NULL, NULL, args, env);
  if (rc != 0) {
    fprintf(stderr, "vault-autosync-helper: spawn %s: %s\n", SYNC_SCRIPT, strerror(rc));
    return 71;
  }

  int status;
  while (waitpid(pid, &status, 0) < 0) {
    if (errno != EINTR) {
      perror("vault-autosync-helper: waitpid");
      return 71;
    }
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 70;
}
