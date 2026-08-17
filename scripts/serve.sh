#!/usr/bin/env bash
# Run the dev server against a chosen Zotero major version.
#
# Zotero 9 and 10 cannot share a data directory. Zotero 10 upgrades the library
# to userdata schema 129 and sets the DB's compatibility marker to 9; Zotero 9
# caps out at _maxCompatibility 7 and refuses to open it ("Database is
# incompatible with this Zotero version"). So target 9 gets its own profile and
# data directory, derived from the ones in .env by suffixing "-zotero9". Target
# 10 uses the .env paths unchanged, since that library is already at 129.
#
# Deriving from .env rather than naming absolute paths keeps worktree isolation
# working: ~/.claude/worktree-hooks/zoteroMindmap.sh rewrites the .env paths per
# worktree, and both targets inherit that.
#
# Only one Zotero runs at a time. `npm start`'s prestart step force-kills every
# zotero-bin, so starting one target takes the other down with it.

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$root_dir/.env"

usage() {
  printf '%s\n' \
    'Usage: scripts/serve.sh <9|10> [-- <extra npm start args>]' \
    '' \
    'Runs `npm start` against the named Zotero major version.' \
    '' \
    '  9    ZOTERO9_BIN from .env, with the profile and data dir suffixed' \
    '       "-zotero9" so the Zotero 10 library is left untouched.' \
    '  10   ZOTERO10_BIN from .env, against the profile and data dir named' \
    '       by ZOTERO_PLUGIN_PROFILE_PATH and ZOTERO_PLUGIN_DATA_DIR.' \
    '' \
    'A plain `npm start` still uses ZOTERO_PLUGIN_ZOTERO_BIN_PATH and is' \
    'unaffected by this script.' \
    '' \
    'Options:' \
    '  -h, --help   Show this message.'
}

# .env uses `KEY = value` with unquoted values that may contain spaces
# ("/home/oscar/Zotero PluginDev"), so match the key and take the rest of
# the line, then trim.
env_value() {
  local key="$1" raw
  [ -f "$env_file" ] || return 0
  raw="$(sed -n "s|^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\\(.*\\)$|\\1|p" "$env_file" | tail -1)"
  printf '%s' "${raw%"${raw##*[![:space:]]}"}"
}

version=""
while [ $# -gt 0 ]; do
  case "$1" in
    9 | 10)
      version="$1"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      printf 'serve.sh: unexpected argument %s\n\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$version" ]; then
  printf 'serve.sh: name a Zotero version (9 or 10)\n\n' >&2
  usage >&2
  exit 2
fi

if [ ! -f "$env_file" ]; then
  printf 'serve.sh: no .env at %s (copy it from .env.example)\n' "$env_file" >&2
  exit 1
fi

base_profile="$(env_value ZOTERO_PLUGIN_PROFILE_PATH)"
base_data="$(env_value ZOTERO_PLUGIN_DATA_DIR)"

if [ -z "$base_profile" ]; then
  printf 'serve.sh: ZOTERO_PLUGIN_PROFILE_PATH is not set in %s\n' "$env_file" >&2
  exit 1
fi

case "$version" in
  9)
    binary="$(env_value ZOTERO9_BIN)"
    profile="${base_profile}-zotero9"
    data="${base_data:+${base_data}-zotero9}"
    ;;
  10)
    binary="$(env_value ZOTERO10_BIN)"
    profile="$base_profile"
    data="$base_data"
    ;;
esac

if [ -z "$binary" ]; then
  printf 'serve.sh: ZOTERO%s_BIN is not set in %s\n' "$version" "$env_file" >&2
  exit 1
fi

if [ ! -x "$binary" ]; then
  printf 'serve.sh: ZOTERO%s_BIN is not an executable file: %s\n' "$version" "$binary" >&2
  exit 1
fi

printf 'serve.sh: Zotero %s\n  binary  %s\n  profile %s\n  data    %s\n' \
  "$version" "$binary" "$profile" "${data:-<Zotero default>}"

export ZOTERO_PLUGIN_ZOTERO_BIN_PATH="$binary"
export ZOTERO_PLUGIN_PROFILE_PATH="$profile"
[ -n "$data" ] && export ZOTERO_PLUGIN_DATA_DIR="$data"

cd "$root_dir"
exec npm start "$@"
