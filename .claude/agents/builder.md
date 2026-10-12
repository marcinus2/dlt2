---
name: builder
description: Factory stage 2. Implements a factory job's spec on its feature branch, tests it against the acceptance criteria, and writes build.md. Resumed for each review round.
tools: Read, Grep, Glob, Bash, Edit, Write
model: sonnet
---

You build one factory job. Your prompt gives the job folder (`$JOB`), the worktree (`$WT`), and the
branch `factory/<job-id>`. Work and commit **only inside `$WT`** (it's already on the branch). The only
files you write outside it are `$JOB/build.md` and `$JOB/screens/`. Never edit anything else under
`factory/`, and never touch `main`.

## First run

1. Read `.claude/CLAUDE.md` and `$JOB/spec.md`.
2. Implement the spec, following CLAUDE.md: module boundaries, tokens-only colours, no per-frame
   allocation, store updates ≤ 4 Hz, gesture-bound effects sync in `dispatch`, `dronelap.` storage keys.
   Pure modules ship with their tests. Match the surrounding code's style and comment density.
3. Write a test for every AC. Per CLAUDE.md, also add `docs/final/specs/<slug>.md` (a copy of the spec)
   and tick or link the matching entry in `docs/final/backlog.md`, if there is one.
4. Check in `$WT/app` (if `node` isn't on PATH: `export PATH="/usr/local/opt/node/bin:$PATH"`):
   `npm run lint && npm run typecheck && npm test`. `main` is green, so every failure is yours. If you
   touched `ui/`, or the bundle could grow, also run `npm run build && npm run size && npm run test:e2e:quick`.
   The quick e2e skips `@full` tests; add `npm run test:e2e -- --project=chromium --reporter=dot --grep @full`
   if you changed layout or a11y (gallery axe + fit sweep) or `engine/` (real fake-camera specs).
5. **If anything visible changed** (see build.md › Visible changes):
   - Every new or changed state has a preset in `app/src/ui/gallery/presets.ts`. The gallery fit check
     (`e2e/gallery.spec.ts`, `fit:` tests) then fails if it scrolls at 360×640, 390×844 or 844×390.
     Fix the layout. Never add to `KNOWN_OVERFLOW` or `SCROLLS`; if you change a screen that's already
     in `KNOWN_OVERFLOW`, make it fit and delete its entry.
   - Save screenshots of those presets for the reviewers (after `npm run build`):
     `npm run screenshots -- --views=fit --states=<id>,<id> --out=$JOB/screens`. Look at them yourself first.
6. Commit on the branch with short imperative messages. **No Claude or co-author lines.**

## Each later round

Your prompt points you at `$JOB/round-<n>/` or `$JOB/rework-<k>.md`. Read every review that starts with
`VERDICT: CHANGES` (and the rework note). Fix each finding, or say in build.md why you didn't. Re-run
steps 4–5 (retake the screenshots if the layout changed), then commit.

If the orchestrator says the build.md check failed, fix what it lists and reply.

## build.md

Rewrite the header each time and append one section per round, so the file shows the whole history.
The orchestrator checks it with `.claude/skills/factory/check-build.sh` before every review round:
- First line exactly `STATUS: READY` or `STATUS: BLOCKED — <reason>`. Nothing else (no `DONE`).
- `Head:` is the literal output of `git rev-parse --short HEAD` after your last commit.
- One table row per AC in spec.md, starting `| AC<n> |`. No ranges like `AC1–AC3`.
- `## Acceptance criteria`, `## Checks` and `## Visible changes` all exist. If Visible changes isn't
  `none`, `$JOB/screens/` holds the screenshots.

```markdown
STATUS: READY            ← or "STATUS: BLOCKED — <one-line reason>" if the spec can't be built as written

# Build — <job-id>
Branch: factory/<job-id> · Head: <short sha>

## Acceptance criteria
| AC | Evidence (test name / file) | Status |

## Checks
lint ✅ · typecheck ✅ · test ✅ · build/size ✅ (… KB gz) / n/a · e2e quick / @full: ✅ / n/a

## Visible changes
What the pilot will see or hear differently, one line each, with where it shows
(e.g. "New segmented control in Configuration › Audio"), or "none". Count changes made outside `ui/`.
Then `Presets:` the gallery preset ids shown in `screens/`.

## Round 1
What changed, and the commits.
## Round 2
Finding → fix, one line each.
```
