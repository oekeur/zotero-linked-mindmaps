#!/usr/bin/env bash
# PreToolUse gate for `git merge`. .claude/settings.json registers this with
# an `if: Bash(git merge *)` filter meant to restrict invocation to merge
# commands, but that filter does not reliably do so -- this hook runs on
# every Bash command reaching it. The extractor below is what actually tells
# a merge apart from anything else and allows non-merges through. Blocks a
# merge into main unless the full `npm test` suite passes on the MERGE RESULT.
#
# Testing main's pre-merge working tree instead would gate the state being
# left rather than the state being created: a branch whose whole purpose is
# repairing failing tests could never land, because the gate fails on exactly
# the failures the merge removes. So the merge is replayed in a throwaway
# detached worktree and the suite runs there. main's own tree is never touched.
#
# npm test (zotero-plugin test) spins up a live Zotero GUI instance that does
# NOT exit on its own once it has printed its pass/fail summary -- confirmed
# empirically: the wrapper process still shows up in `pgrep` minutes after
# "Test run completed" appears in its own output. Because of that, this script
# does not trust `npm test`'s exit code (a killed process reports an exit code
# reflecting the kill, not the actual outcome) -- it parses the printed summary
# line directly instead. Only this run's own Zoteros are killed, identified by
# the temp worktree path in their arguments rather than by when they appeared,
# so any other Zotero on the machine survives whenever it started.

set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

allow() { echo '{}'; exit 0; }
block() { jq -n --arg reason "$1" '{decision:"block", reason:$reason}'; exit 0; }

# Not a real merge attempt (aborting/continuing/quitting an existing one).
if printf '%s' "$cmd" | grep -qE -- '--abort|--continue|--quit'; then
  allow
fi

branch=$(git branch --show-current 2>/dev/null)
if [ "$branch" != "main" ]; then
  allow
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null)

# Determines what, if anything, the command merges. Prints one of:
#   NOMERGE  - no `merge` token follows a git invocation: not a merge
#              invocation at all (allow).
#   NOREF    - it is a `git merge`, but no ref could be extracted, or the
#              command could not even be tokenized (block).
#   <ref>    - the first non-flag token after `git merge`, skipping the
#              values of flags that take one. shlex keeps quoted -m messages
#              in one piece.
ref=$(printf '%s' "$cmd" | python3 -c '
import shlex, sys

try:
    t = shlex.split(sys.stdin.read())
except ValueError:
    print("NOREF")
    sys.exit(0)

# Git global options between the invocation word and the subcommand. Ones
# without a value; ones with a value either as a separate following token or
# joined with "=" (--exec-path only ever takes the joined form, but treating
# it like the rest costs nothing and stays on the safe, over-matching side).
NOARG_GLOBAL = {"-p", "--paginate", "-P", "--no-pager", "--bare",
                "--no-replace-objects", "--literal-pathspecs",
                "--glob-pathspecs", "--noglob-pathspecs",
                "--icase-pathspecs", "--no-optional-locks"}
VALUE_GLOBAL = {"-C", "-c", "--git-dir", "--work-tree", "--namespace",
                 "--exec-path", "--config-env"}


def is_git_word(tok):
    base = tok.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if base.endswith(".exe"):
        base = base[:-4]
    return base == "git"


def skip_global_opts(tokens, j):
    while j < len(tokens):
        tok = tokens[j]
        if tok in NOARG_GLOBAL:
            j += 1
        elif tok in VALUE_GLOBAL:
            j += 2
        elif any(tok.startswith(opt + "=") for opt in VALUE_GLOBAL):
            j += 1
        else:
            break
    return j


merge_idx = None
for i, tok in enumerate(t):
    if not is_git_word(tok):
        continue
    j = skip_global_opts(t, i + 1)
    if j < len(t) and t[j] == "merge":
        merge_idx = j
        break

if merge_idx is None:
    print("NOMERGE")
    sys.exit(0)

takes_value = {"-m", "--message", "-F", "--file", "-s", "--strategy",
               "-X", "--strategy-option", "-S", "--gpg-sign"}
skip = False
for tok in t[merge_idx + 1:]:
    if skip:
        skip = False
        continue
    if tok in takes_value:
        skip = True
        continue
    if tok.startswith("-"):
        continue
    print(tok)
    sys.exit(0)

print("NOREF")
')

# An empty $ref means the extractor crashed or exited non-zero without
# printing anything -- that must still block, not fail open.
if [ -z "$ref" ] || [ "$ref" = "NOREF" ]; then
  block "pre-merge gate could not determine which ref '$cmd' merges, so it could not test the merge result. Merge manually if this is intended."
fi

if [ "$ref" = "NOMERGE" ]; then
  allow
fi

if ! git rev-parse --verify --quiet "$ref^{commit}" >/dev/null; then
  block "pre-merge gate could not resolve '$ref' to a commit."
fi

# The merge would be a no-op: the ref is already contained in HEAD.
if git merge-base --is-ancestor "$ref" HEAD 2>/dev/null; then
  allow
fi

tmp=$(mktemp -d /tmp/zoteromindmap-premerge.XXXXXX)
work="$tmp/work"
log="$tmp/test.log"

cleanup() {
  git worktree remove --force "$work" >/dev/null 2>&1
  git worktree prune >/dev/null 2>&1
  # Remove the mktemp dir itself, not just the worktree inside it. Without this
  # every gated merge leaves /tmp/zoteromindmap-premerge.XXXXXX behind holding
  # test.log. The guard is against an unset $tmp turning this into `rm -rf /`;
  # the kept log on a failure path is mktemp'd outside $tmp and survives, which
  # the block message's "Full log:" pointer depends on.
  [ -n "${tmp:-}" ] && [ -d "$tmp" ] && rm -rf "$tmp"
}
trap cleanup EXIT

if ! git worktree add --detach "$work" HEAD >/dev/null 2>&1; then
  block "pre-merge gate could not create a temporary worktree to test the merge result."
fi

if ! ( cd "$work" && git merge --no-commit --no-ff "$ref" >/dev/null 2>&1 ); then
  # A conflicted merge is a real answer: report it rather than running tests.
  conflicts=$( cd "$work" && git diff --name-only --diff-filter=U | tr '\n' ' ')
  block "merging '$ref' into main conflicts, so the gate could not test the result. Conflicting paths: ${conflicts:-unknown}"
fi

# The suite needs installed deps and a Zotero binary path; the test profile and
# data dirs it creates are CWD-relative, so they land inside the temp worktree.
ln -s "$repo_root/node_modules" "$work/node_modules" 2>/dev/null
if [ -f "$repo_root/.env" ]; then
  sed -e "s|^ZOTERO_PLUGIN_PROFILE_PATH.*|ZOTERO_PLUGIN_PROFILE_PATH = $work/.scaffold/dev-profile|" \
      -e "s|^ZOTERO_PLUGIN_DATA_DIR.*|ZOTERO_PLUGIN_DATA_DIR = $work/.scaffold/dev-data|" \
      "$repo_root/.env" > "$work/.env"
fi

# Zotero processes belonging to THIS run, identified by path rather than by a
# time window. The scaffold resolves the test profile and data dir relative to
# CWD, so both land under $work and appear in the process's own arguments:
#
#   zotero-bin ... -profile $work/.scaffold/test/profile --dataDir $work/...
#
# $work is a fresh mktemp path, so nothing outside this run can name it. The
# previous approach diffed `pgrep -f zotero-bin` before and after and killed
# the difference, which killed any Zotero that happened to start while the gate
# was running, including one launched by hand.
#
# Two things this deliberately does not do. It does not match `pgrep -f` alone,
# because any command line merely mentioning zotero-bin matches itself. And it
# does not expect content processes to carry the path: they are spawned as
# `-contentproc ... -parentPid <pid>` with no profile argument, so they are
# swept separately below, after their parents are gone.
gate_zotero_pids() {
  local pid args
  ps -ww -e -o pid=,args= 2>/dev/null | while read -r pid args; do
    case "$args" in
      *"$work"*) ;;
      *) continue ;;
    esac
    case "$args" in
      */zotero-bin\ * | */zotero\ * | */zotero-bin | */zotero) printf '%s\n' "$pid" ;;
    esac
  done
}

# Content processes of the pids just killed. They exit with their parent, but
# sweep any that outlive it rather than leaving orphans holding the profile.
gate_zotero_children() {
  local parents="$1" pid args parent
  [ -n "$parents" ] || return 0
  ps -ww -e -o pid=,args= 2>/dev/null | while read -r pid args; do
    case "$args" in
      *-contentproc*) ;;
      *) continue ;;
    esac
    for parent in $parents; do
      case "$args" in
        *"-parentPid $parent "* | *"-parentPid $parent") printf '%s\n' "$pid" ;;
      esac
    done
  done
}

# The Xvfb that xvfb-run starts for this run, found by descent from $test_pid
# rather than by a before/after window, for the same reason as the Zoteros
# above: a window kills whatever else happened to start inside it. xvfb-run
# launches Xvfb from its own shell, which is a child of the subshell below, so
# this run's Xvfb is always a descendant of $test_pid and nothing else is.
# Must be called BEFORE the children of $test_pid are killed, or the ancestry
# it walks is already gone.
gate_descendants() {
  local queue="$1" next pid
  while [ -n "$queue" ]; do
    next=""
    for pid in $queue; do
      printf '%s\n' "$pid"
      next="$next $(pgrep -P "$pid" 2>/dev/null | tr '\n' ' ')"
    done
    queue="$next"
  done
}

gate_xvfb_pids() {
  local descendants pid
  descendants=$(gate_descendants "$test_pid" | sort -u)
  for pid in $(pgrep -x Xvfb 2>/dev/null); do
    printf '%s\n' "$descendants" | grep -qx "$pid" && printf '%s\n' "$pid"
  done
}

# The suite drives a live Zotero GUI, so without a wrapper the gate takes over
# the real desktop for its whole run and competes for focus with whatever is on
# it. xvfb-run puts it on a virtual display instead.
#
# `xvfb-run` alone is not enough on a Wayland session, and it fails silently:
# the Zotero launcher exports MOZ_ENABLE_WAYLAND=1, so Gecko connects to the
# compositor named by the inherited WAYLAND_DISPLAY and paints on the real
# screen while DISPLAY points at an Xvfb nothing ever draws on. The launcher's
# own export cannot be overridden from outside, so removing WAYLAND_DISPLAY is
# the only lever there is -- do not reduce this back to a bare `xvfb-run -a`.
# The probe that tells the two apart is written up in scripts/verify.sh, which
# carries the same wrapper: read the Zotero process's environ for
# WAYLAND_DISPLAY and count children of the Xvfb root. Absence of visible
# windows is not the test; the bare wrapper hides nothing, it paints elsewhere.
#
# The kill machinery below is unaffected: it identifies this run's Zoteros by
# the $work path in their arguments, which xvfb-run does not change, and this
# run's Xvfb by descent from the subshell. Absent xvfb-run the suite runs on
# the real display, as before.
if command -v xvfb-run >/dev/null 2>&1; then
  ( cd "$work" && env -u WAYLAND_DISPLAY xvfb-run -a npm test >"$log" 2>&1 ) &
else
  ( cd "$work" && npm test >"$log" 2>&1 ) &
fi
test_pid=$!

# Wait up to 12 minutes for the summary line to appear, polling every 2s.
# The suite takes about 150 seconds (2.5 minutes) for 274 tests in isolation
# but stretches several-fold when other Zotero instances are running on the
# same machine, so a tighter ceiling blocks merges that would have passed.
elapsed=0
while [ "$elapsed" -lt 720 ]; do
  if grep -q "Test run completed" "$log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$test_pid" 2>/dev/null; then
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

# Resolved before anything is killed: gate_xvfb_pids walks the process tree
# down from $test_pid, and killing its children first would erase the ancestry
# it needs.
xvfb_mine=$(gate_xvfb_pids | sort -u)

mine=$(gate_zotero_pids | sort -u)
for pid in $mine; do
  kill -9 "$pid" >/dev/null 2>&1
done
for pid in $(gate_zotero_children "$mine" | sort -u); do
  kill -9 "$pid" >/dev/null 2>&1
done

# xvfb-run kills its Xvfb from an EXIT trap, which a SIGKILL to the process
# group never lets run, so without this every gated merge would strand an X
# server for the life of the login session. Measured: one `Xvfb :101` survived
# a gate run before this was added.
for pid in $xvfb_mine; do
  kill -9 "$pid" >/dev/null 2>&1
done
pkill -9 -P "$test_pid" >/dev/null 2>&1
wait "$test_pid" 2>/dev/null

summary=$(grep "Test run completed" "$log" | tail -1)

if [ -z "$summary" ]; then
  keep=$(mktemp /tmp/zoteromindmap-premerge-test.XXXXXX.log)
  cp "$log" "$keep" 2>/dev/null
  block "npm test did not finish within the timeout while testing the result of merging '$ref' into main. Full log: $keep"
elif printf '%s' "$summary" | grep -qE '[1-9][0-9]* failed'; then
  keep=$(mktemp /tmp/zoteromindmap-premerge-test.XXXXXX.log)
  cp "$log" "$keep" 2>/dev/null
  block "npm test failed on the result of merging '$ref' into main: ${summary}. Full log: $keep"
fi

allow
