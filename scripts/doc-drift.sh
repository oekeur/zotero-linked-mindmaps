#!/usr/bin/env bash
#
# Rank the docs most likely to have gone stale, by comparing commit dates.
#
#   scripts/doc-drift.sh [--porcelain]
#
#   --porcelain  one candidate per line as `score<TAB>doc<TAB>reason`, for
#                piping into another tool; no headings, no colour
#
# Two probes, both cheap and both read-only:
#
#   Citation drift  Most docs under docs/internals/ cite src/ paths inline.
#                   A doc whose cited sources have commits newer than the doc
#                   itself is a candidate. The count of those commits is the
#                   score, so a doc trailing six commits outranks one trailing
#                   a single formatting change.
#
#   Orphan modules  The complement: a source module whose newest mentioning
#                   doc predates the module's last commit. Catches drift in
#                   docs that describe a module without citing its path, which
#                   is most of docs/user-guide/.
#
# This ranks candidates. It does not decide staleness: a doc can trail ten
# commits and still be accurate, and a doc can be wrong the day it is written.
# Reading the doc against the source is the only thing that gives a verdict.
# See the doc-drift skill for the verification pass this feeds.
#
# Excluded on purpose: docs/.vitepress/ is build output, and
# docs/backfill-queue.md is a closed historical record that is meant to
# describe the repo as it was.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

PORCELAIN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --porcelain) PORCELAIN=1 ;;
    -h|--help) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'doc-drift: unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

say() { [ "$PORCELAIN" -eq 1 ] || printf '\n◆ %s\n' "$*"; }

# Last commit timestamp for a path, empty if the path is untracked.
last_commit() { git log -1 --format='%ct' -- "$1"; }

docs_list() {
  find docs -name '*.md' \
    -not -path 'docs/.vitepress/*' \
    -not -name 'backfill-queue.md' | sort
}

# Docs that cite source paths whose files have moved on since.
say 'Citation drift'

CITED_ROWS=""
while IFS= read -r doc; do
  [ -n "$doc" ] || continue
  doc_date="$(last_commit "$doc")"
  [ -n "$doc_date" ] || continue

  score=0
  reason=""
  while IFS= read -r src; do
    [ -n "$src" ] || continue
    [ -f "$src" ] || continue
    src_date="$(last_commit "$src")"
    [ -n "$src_date" ] || continue
    [ "$src_date" -gt "$doc_date" ] || continue
    n="$(git log --oneline "--since=@$doc_date" -- "$src" | wc -l | tr -d ' ')"
    score=$((score + n))
    # Two locales ship files of the same name, so keep the parent directory
    # to tell addon/locale/en-US/addon.ftl from its nl-NL twin.
    reason="$reason $(printf '%s' "$src" | awk -F/ '{ print (NF>1 ? $(NF-1) "/" $NF : $NF) }')($n)"
  done < <(grep -ohE '(src|addon|scripts)/[A-Za-z0-9_./-]+\.(ts|js|mjs|sh|json|ftl|css|xhtml)' "$doc" 2>/dev/null | sort -u)

  [ "$score" -gt 0 ] || continue
  CITED_ROWS="$CITED_ROWS$score	$doc	cites:$reason
"
done < <(docs_list)

if [ -n "$CITED_ROWS" ]; then
  if [ "$PORCELAIN" -eq 1 ]; then
    printf '%s' "$CITED_ROWS" | sort -rn
  else
    printf '%s' "$CITED_ROWS" | sort -rn | while IFS=$'\t' read -r score doc reason; do
      printf '  %3s  %-52s %s\n' "$score" "$doc" "$reason"
    done
  fi
else
  say 'No citation drift.'
fi

# Modules whose newest mentioning doc is older than the module.
say 'Modules ahead of every doc that mentions them'

ORPHAN_ROWS=""
while IFS= read -r src; do
  [ -n "$src" ] || continue
  base="$(basename "$src" .ts)"
  src_date="$(last_commit "$src")"
  [ -n "$src_date" ] || continue

  newest=0
  newest_doc=""
  while IFS= read -r doc; do
    [ -n "$doc" ] || continue
    d="$(last_commit "$doc")"
    [ -n "$d" ] || continue
    if [ "$d" -gt "$newest" ]; then
      newest="$d"
      newest_doc="$doc"
    fi
  done < <(docs_list | while IFS= read -r f; do
    grep -qF -- "$base" "$f" && printf '%s\n' "$f"
  done)

  if [ "$newest" -eq 0 ]; then
    # No doc names the module. Often a false positive: the docs describe the
    # feature under its user-facing name rather than the filename, so this is
    # a prompt to check, not a gap.
    ORPHAN_ROWS="${ORPHAN_ROWS}0	$src	no doc names this module
"
  elif [ "$src_date" -gt "$newest" ]; then
    n="$(git log --oneline "--since=@$newest" -- "$src" | wc -l | tr -d ' ')"
    ORPHAN_ROWS="$ORPHAN_ROWS$n	$src	newest doc $newest_doc trails by $n
"
  fi
done < <(find src -name '*.ts' | sort)

if [ -n "$ORPHAN_ROWS" ]; then
  if [ "$PORCELAIN" -eq 1 ]; then
    printf '%s' "$ORPHAN_ROWS" | sort -rn
  else
    printf '%s' "$ORPHAN_ROWS" | sort -rn | while IFS=$'\t' read -r score src reason; do
      printf '  %3s  %-52s %s\n' "$score" "$src" "$reason"
    done
  fi
else
  say 'No modules ahead of their docs.'
fi

[ "$PORCELAIN" -eq 1 ] || printf '\n'
