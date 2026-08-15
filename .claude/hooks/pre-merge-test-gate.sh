#!/usr/bin/env bash
# PreToolUse gate for `git merge` (see .claude/settings.json's `if` filter,
# which only invokes this for Bash(git merge *) commands). Blocks a merge
# while the current branch is main unless the full `npm test` suite passes.
#
# npm test (zotero-plugin test) spins up a live Zotero GUI instance that
# does NOT exit on its own once it has printed its pass/fail summary -- the
# instance must be explicitly killed (pkill -9 zotero-bin), confirmed
# empirically: the wrapper process still shows up in `pgrep` minutes after
# "Test run completed" appears in its own output. Because of that, this
# script does not trust `npm test`'s exit code (a killed process reports an
# exit code that reflects the kill, not necessarily the actual pass/fail
# outcome) -- it parses the printed summary line directly instead.

set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

# Not a real merge attempt (aborting/continuing/quitting an existing one) --
# nothing to gate.
if printf '%s' "$cmd" | grep -qE -- '--abort|--continue|--quit'; then
  echo '{}'
  exit 0
fi

branch=$(git branch --show-current 2>/dev/null)
if [ "$branch" != "main" ]; then
  echo '{}'
  exit 0
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
log=$(mktemp /tmp/zoteromindmap-premerge-test.XXXXXX.log)

( cd "$repo_root" && npm test >"$log" 2>&1 ) &
test_pid=$!

# Wait up to 4 minutes for the summary line to appear, polling every 2s.
elapsed=0
while [ "$elapsed" -lt 240 ]; do
  if grep -q "Test run completed" "$log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$test_pid" 2>/dev/null; then
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

# The GUI instance (and its wrapper) won't exit on their own -- kill them.
pkill -9 -f zotero-bin >/dev/null 2>&1
pkill -9 -f "zotero-plugin test" >/dev/null 2>&1
wait "$test_pid" 2>/dev/null

summary=$(grep "Test run completed" "$log" | tail -1)

if [ -z "$summary" ]; then
  reason="npm test did not finish within the timeout before merging into main branch '$branch'. Full log: $log"
  jq -n --arg reason "$reason" '{decision:"block", reason:$reason}'
elif printf '%s' "$summary" | grep -qE '[1-9][0-9]* failed'; then
  reason="npm test failed before merging into main: ${summary}. Full log: $log"
  jq -n --arg reason "$reason" '{decision:"block", reason:$reason}'
else
  rm -f "$log"
  echo '{}'
fi
