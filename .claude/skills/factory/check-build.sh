#!/usr/bin/env bash
# Checks a job's build.md against the builder template before reviews start.
# Usage: check-build.sh <job-dir> <worktree>. Prints READY, BLOCKED, or one FAIL line per problem (exit 1).
set -u
job=$1 wt=$2
build=$job/build.md
[ -f "$build" ] || { echo "FAIL: $build is missing"; exit 1; }

first=$(head -n 1 "$build")
case $first in
  'STATUS: READY') ;;
  'STATUS: BLOCKED — '?*) echo BLOCKED; exit 0 ;;
  *) echo "FAIL: first line is \"$first\"; it must be exactly \"STATUS: READY\" or \"STATUS: BLOCKED — <reason>\""; exit 1 ;;
esac

fails=()
head_sha=$(git -C "$wt" rev-parse HEAD)
sha=$(grep -oE 'Head: [0-9a-f]{7,40}' "$build" | head -n 1 | cut -c7-)
if [ -z "$sha" ]; then
  fails+=("no \"Head: <sha>\" line; write the output of \`git rev-parse --short HEAD\`")
elif [ "${head_sha#"$sha"}" = "$head_sha" ]; then
  fails+=("Head: $sha is not the branch head (${head_sha:0:7}); commit everything, then update the Head line")
fi

for section in 'Acceptance criteria' 'Checks' 'Visible changes'; do
  grep -qx "## $section" "$build" || fails+=("missing section \"## $section\"")
done

# One table row per AC in spec.md, e.g. "| AC3 | …".
for ac in $(sed -n '/^## Acceptance criteria/,/^## /p' "$job/spec.md" | grep -oE '^- \*\*AC[0-9]+' | cut -c5-); do
  grep -qE "^\| *$ac *\|" "$build" || fails+=("no \"| $ac |\" row in the acceptance-criteria table")
done

visible=$(sed -n '/^## Visible changes/,/^## /p' "$build" | sed '1d;/^## /d' | tr -d '[:space:]')
if [ -n "$visible" ] && [ "$(printf %s "$visible" | tr '[:upper:]' '[:lower:]' | cut -c1-4)" != none ]; then
  ls "$job"/screens/*.png >/dev/null 2>&1 ||
    fails+=("visible changes but no screenshots in $job/screens/ (npm run screenshots -- --views=fit --states=<ids> --out=$job/screens)")
fi

if [ ${#fails[@]} -gt 0 ]; then
  printf 'FAIL: %s\n' "${fails[@]}"
  exit 1
fi
echo READY
