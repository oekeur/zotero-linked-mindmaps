#!/usr/bin/env bash
#
# The verification gate: build, lint, typecheck, and the live-Zotero startup
# check, in the order that fails cheapest first.
#
#   scripts/verify.sh [--no-test] [--test-only]
#
#   --no-test    build, lint, and typecheck only; no Zotero is launched
#   --test-only  skip build, lint, and typecheck; run the live test suite only
#
# Runs every requested stage even after one fails, then exits non-zero naming
# the stages that failed. `npm run typecheck` covers tsc --noEmit for both
# src/ and test/, so a changed export signature that breaks a spec fails here
# instead of only surfacing once the live suite runs.

set -uo pipefail

RUN_STATIC=1
RUN_TEST=1

while [ $# -gt 0 ]; do
  case "$1" in
    --no-test) RUN_TEST=0 ;;
    --test-only) RUN_STATIC=0 ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'verify: unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

cd "$(dirname "$0")/.."

say() { printf '\n◆ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }

FAILED=()

run_stage() {
  local name="$1"; shift
  say "$name"
  if "$@"; then
    printf '  %s ok\n' "$name"
  else
    warn "$name FAILED"
    FAILED+=("$name")
  fi
}

# PIDs of actual Zotero processes. Matching `pgrep -f zotero-bin` alone is not
# enough: any shell command that merely mentions zotero-bin matches its own
# command line, and a false positive here blocks the gate for no reason.
# /proc/<pid>/comm is the executable name, so it cannot be tripped that way.
zotero_pids() {
  local pid comm
  for pid in $(pgrep -f zotero-bin 2>/dev/null); do
    comm="$(cat "/proc/$pid/comm" 2>/dev/null || true)"
    [ "$comm" = "zotero-bin" ] && printf '%s\n' "$pid"
  done
}

pid_cmdline() {
  tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null || true
}

# A test instance left behind by an interrupted run holds the profile the next
# run wants. Safe to kill: the path proves it belongs to a test run. Killed by
# PID rather than `pkill -f`, which would also match an unrelated shell.
clear_stale_test_zotero() {
  local pid cmd killed=0
  for pid in $(zotero_pids); do
    cmd="$(pid_cmdline "$pid")"
    case "$cmd" in
      *scaffold/test*) kill "$pid" 2>/dev/null && killed=1 ;;
    esac
  done
  if [ "$killed" = 1 ]; then
    warn "cleared a leftover test-profile Zotero"
    # kill returns before the process is gone; give it a moment to release the
    # profile lock rather than racing the next launch into a stale lock.
    sleep 2
  fi
}

if [ "$RUN_STATIC" = 1 ]; then
  run_stage build npm run build
  run_stage lint npm run lint:check
  run_stage typecheck npm run typecheck
fi

# Safe next to a dev Zotero from `npm start`: `npm run test:fast` kills its own
# process group and the test profile is CWD-relative, so the dev instance is
# left alone. clear_stale_test_zotero below still matches any `scaffold/test`
# profile, including another worktree's in-flight test run.
#
# The suite drives a live Zotero GUI, so without a wrapper it opens windows on
# the real desktop and competes for focus with whatever is on it. xvfb-run puts
# it on a virtual display instead.
#
# `xvfb-run` alone is not enough on a Wayland session, and it fails silently:
# the Zotero launcher exports MOZ_ENABLE_WAYLAND=1, so Gecko connects to the
# compositor named by the inherited WAYLAND_DISPLAY and paints on the real
# screen while DISPLAY points at an Xvfb nothing ever draws on. The launcher's
# own export cannot be overridden from outside, so removing WAYLAND_DISPLAY is
# the only lever there is -- do not reduce this back to a bare `xvfb-run -a`.
#
# The probe that tells the two apart, measured here 2026-09-04: with the suite
# running, read the Zotero process's own environ for WAYLAND_DISPLAY, then run
# `xwininfo -root -children` on its DISPLAY (xvfb-run keeps a private
# Xauthority, so pass XAUTHORITY from the Xvfb process's -auth argument, or
# every query fails on the cookie rather than on the display being empty).
# Bare xvfb-run: WAYLAND_DISPLAY=wayland-0 survives and the Xvfb root has 0
# children. With it unset: absent from the environ, and the root lists 18
# windows including "My Library - Zotero". Absence of visible windows is not
# the test -- the bare wrapper hides nothing, it just paints elsewhere.
#
# The kill machinery above is unaffected: it matches Zotero by /proc/<pid>/comm
# and the profile path in its arguments, neither of which xvfb-run changes.
# Absent xvfb-run (CI images without it, macOS) the suite runs on the real
# display, as before, so this is a wrapper and not a requirement.
if [ "$RUN_TEST" = 1 ]; then
  clear_stale_test_zotero
  if command -v xvfb-run >/dev/null 2>&1; then
    run_stage test env -u WAYLAND_DISPLAY xvfb-run -a npm run test:fast
  else
    warn "xvfb-run not found; running the suite on the real display"
    run_stage test npm run test:fast
  fi
fi

if [ "${#FAILED[@]}" -gt 0 ]; then
  printf '\n◆ FAILED: %s\n' "${FAILED[*]}" >&2
  exit 1
fi

printf '\n◆ All stages passed.\n'
