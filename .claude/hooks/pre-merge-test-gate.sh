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
# line directly instead. Only Zotero processes this script started are killed;
# a dev instance from `npm start` is left alone.

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

# Zotero processes already running (a dev instance from `npm start`) must
# survive this run, so record them and kill only what appears afterwards.
before=$(pgrep -f zotero-bin 2>/dev/null | sort -u)

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
# The Zotero half of the kill machinery below is unaffected: it compares pgrep
# snapshots taken before and after, which xvfb-run does not change. The Xvfb
# half exists because of the wrapper -- see the note on xvfb_before. Absent
# xvfb-run the suite runs on the real display, as before.
xvfb_before=$(pgrep -x Xvfb 2>/dev/null | sort -u)
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

after=$(pgrep -f zotero-bin 2>/dev/null | sort -u)
for pid in $(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after")); do
  kill -9 "$pid" >/dev/null 2>&1
done

# xvfb-run kills its Xvfb from an EXIT trap, which a SIGKILL to the process
# group never lets run, so without this every gated merge would strand an X
# server for the life of the login session. Measured: one `Xvfb :101` survived
# a gate run before this was added. Matched the same way as Zotero above --
# only displays that appeared during this run are killed, so a dev instance's
# Xvfb or another worktree's gate keeps its own. `pgrep -x` matches the
# executable name, so a shell command merely mentioning Xvfb cannot be hit.
xvfb_after=$(pgrep -x Xvfb 2>/dev/null | sort -u)
for pid in $(comm -13 <(printf '%s\n' "$xvfb_before") <(printf '%s\n' "$xvfb_after")); do
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
