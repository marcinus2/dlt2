#!/usr/bin/env bash
# Picks the reviewers to run in review round 2+. Usage: rerun.sh <job-dir> <worktree> <prev-round> <reviewed-sha>
# (<reviewed-sha> = the head the previous round reviewed). Prints one line per reviewer:
#   run <key> — <why>     or     carry <key> — <why>
set -u
job=$1 wt=$2 prev=$3 since=$4

# What the pilot sees or hears: ui/ux re-run when the fixes touch any of these.
visible='^app/(src/(ui|styles|session|audio)/|src/app/(machine|effects)\.ts|src/settings/schema\.ts|index\.html|public/)'
# The security reviewer's checklist: files, then code it looks for in changed lines.
sec_files='(^|/)(package(-lock)?\.json|vite\.config\.ts|manifest\.webmanifest)$|^app/public/|^app/index\.html$|^\.github/|^app/src/settings/storage\.ts$'
sec_code='localStorage|sessionStorage|indexedDB|URLSearchParams|location\.(search|hash|href)|innerHTML|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|getUserMedia|mediaDevices|serviceWorker'
tests='(\.test\.tsx?|^app/e2e/)'

if ! git -C "$wt" merge-base --is-ancestor "$since" HEAD 2>/dev/null; then
  for key in security ux ui code; do echo "run $key — $since is not an ancestor of HEAD, can't scope the fixes"; done
  exit 0
fi
files=$(git -C "$wt" diff --name-only "$since"..HEAD | grep -vE "$tests")
first() { printf '%s\n' "$files" | grep -E "$1" | head -n 1; }

for key in security ux ui code; do
  verdict=$(head -n 1 "$job/round-$prev/review-$key.md" 2>/dev/null)
  if [ "$key" = code ]; then
    echo "run code — always"
  elif [ "${verdict#VERDICT: PASS}" = "$verdict" ]; then
    echo "run $key — round $prev verdict: ${verdict:-missing}"
  elif [ "$key" = security ]; then
    hit=$(first "$sec_files")
    [ -z "$hit" ] && [ -n "$files" ] &&
      hit=$(git -C "$wt" diff -U0 "$since"..HEAD -- $files | grep -E '^[+-][^+-]' | grep -oE "$sec_code" | head -n 1)
    if [ -n "$hit" ]; then echo "run security — fixes touch $hit"
    else echo "carry security — fixes touch no file or code on its checklist (deps, vite, manifest/SW, CI, storage, URL params, innerHTML, network, camera)"; fi
  else
    hit=$(first "$visible")
    if [ -n "$hit" ]; then echo "run $key — fixes touch $hit"
    else echo "carry $key — fixes touch nothing visible (ui/, styles/, session/, audio/, machine, effects, schema)"; fi
  fi
done
