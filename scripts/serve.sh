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
# `npm start`'s prestart step (scripts/clean-dev-profile.mjs) kills only the
# Zotero holding the profile it is about to launch, so starting one target does
# not take down a Zotero running against the other profile.

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$root_dir/.env"

usage() {
  printf '%s\n' \
    'Usage: scripts/serve.sh [--headless] <9|10> [-- <extra npm start args>]' \
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
    '  --headless   Run `npm run start:headless` instead, so Zotero opens on a' \
    '               virtual display and leaves the desktop alone.' \
    '  -h, --help   Show this message.'
}

# Reads .env with dotenv's own parser, the one the scaffold (through c12) uses,
# so inline `# comments` and quoted values resolve to what the dev server sees.
# dotenv is already in node_modules as a dependency of the scaffold; it is
# resolved from the repo root so the script works from any directory.
env_value() {
  [ -f "$env_file" ] || return 0
  node -e '
    const { parse } = require(require.resolve("dotenv", { paths: [process.argv[3]] }));
    const value = parse(require("fs").readFileSync(process.argv[1]))[process.argv[2]];
    process.stdout.write(value ?? "");
  ' "$env_file" "$1" "$root_dir"
}

version=""
start_script="start"
while [ $# -gt 0 ]; do
  case "$1" in
    9 | 10)
      version="$1"
      shift
      ;;
    --headless)
      start_script="start:headless"
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
    if [ -z "$base_data" ]; then
      printf 'serve.sh: ZOTERO_PLUGIN_DATA_DIR is empty in %s\n' "$env_file" >&2
      printf '  Zotero 9 would fall back to the default data directory, which is shared with\n  Zotero 10 or your real library. Set it; the Zotero 9 directory is derived from it.\n' >&2
      exit 1
    fi
    data="${base_data}-zotero9"
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

case "$(basename "$binary")" in
  zotero-bin)
    printf 'serve.sh: ZOTERO%s_BIN must be the `zotero` launcher, not zotero-bin: %s\n' "$version" "$binary" >&2
    exit 1
    ;;
esac

printf 'serve.sh: Zotero %s\n  binary  %s\n  profile %s\n  data    %s\n' \
  "$version" "$binary" "$profile" "${data:-<Zotero default>}"

export ZOTERO_PLUGIN_ZOTERO_BIN_PATH="$binary"
export ZOTERO_PLUGIN_PROFILE_PATH="$profile"
[ -n "$data" ] && export ZOTERO_PLUGIN_DATA_DIR="$data"

cd "$root_dir"
exec npm run "$start_script" -- "$@"
