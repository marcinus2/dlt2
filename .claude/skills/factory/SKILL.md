---
name: factory
description: Software factory orchestrator. Runs a feature through spec → build → 4 parallel reviews → approval → merge, using the subagents in .claude/agents and the state in factory/.
argument-hint: "<feature> | next | approve <job-id> | rework <job-id> <note>"
disable-model-invocation: true
---

# /factory — orchestrator

You are the orchestrator. You run the loop, spawn every agent, and are the **only writer of
`factory/board.json`**. Agents get their context from files and write only their own file; their
spawn prompt contains paths, never conversation history.

## The loop (edit this to change the factory)

```
feature → spec-writer → builder ─┬─ security-reviewer ─┐
             (opus)     (opus)   ├─ ux-reviewer       ─┤  WAIT FOR ALL 4
                          ▲      ├─ ui-reviewer       ─┤
                          │      └─ code-reviewer     ─┘
                          │                 │
                          └── any CHANGES ──┤ (builder resumed max MAX_FIX_ROUNDS times)
                                            ▼ all PASS
                                         approver (opus) ── APPROVE → merge to main
                                                        └─ ESCALATE → needs-human ◄── /factory approve
```

- `MAX_FIX_ROUNDS = 2` — builder resumes per cycle before the job goes to needs-human.
- Reviewers: `security` (security-reviewer), `ux` (ux-reviewer), `ui` (ui-reviewer), `code` (code-reviewer).

## Paths

| What | Path |
|---|---|
| Repo root (`$ROOT`) | `git rev-parse --show-toplevel` from the main checkout |
| Job folder (`$JOB`) | `$ROOT/factory/jobs/<job-id>/` |
| Worktree (`$WT`) | `$ROOT/factory/.worktrees/<job-id>/` (gitignored), branch `factory/<job-id>` |
| App inside a worktree | `$WT/app/` |

The main checkout always stays on `main`. Builders work only in their worktree, so `board.json` and
job files are never on a feature branch. If `node` isn't on PATH, prefix shell commands with
`export PATH="/usr/local/opt/node/bin:$PATH"`.

## board.json

Rewrite the whole file on every transition (Read, then Write). One object per job:

```json
{ "jobs": [ {
  "id": "003-rate-limiting", "title": "Rate limiting", "branch": "factory/003-rate-limiting",
  "stage": "review", "round": 2, "maxRound": 3, "reworks": 0,
  "reviews": { "security": "CHANGES", "ux": "PASS", "ui": "pending", "code": "PASS" },
  "rounds": [ { "security": "CHANGES", "ux": "PASS", "ui": "PASS", "code": "CHANGES" } ],
  "builder": "builder-003-rate-limiting", "note": "", "updated": "2026-10-10T20:00:00Z"
} ] }
```

- `stage`: `spec` → `build` → `review` → `approve` → `merged` | `needs-human`.
- `reviews` is the current round (`pending` until the file lands); `rounds` holds the verdicts of
  earlier rounds, oldest first. `note` says why a job needs a human. `updated` comes from `date -u +%FT%TZ`.
- `builder` is whatever SendMessage needs to reach the builder (its name, or its agent ID if
  the Agent tool returns one).

## Commands

### `/factory <feature>` — new job

1. **Preflight.** `git -C $ROOT branch --show-current` must be `main`; otherwise stop and tell the user.
2. **Create.** id = next 3-digit number after the highest in board.json (start at `001`) + `-` +
   a 2–4 word kebab slug. Create `$JOB`. Add the job (`stage: spec`, `round: 0`, `maxRound: 1 + MAX_FIX_ROUNDS`).
3. **Spec.** Spawn `spec-writer` (foreground) with: the feature text verbatim, `$JOB/spec.md`.
4. **Worktree.**
   ```sh
   git -C $ROOT worktree add factory/.worktrees/<id> -b factory/<id> main
   ln -s $ROOT/app/node_modules $WT/app/node_modules
   ```
5. **Build.** `stage: build`. Spawn `builder` (foreground) **named `builder-<id>`** with: `$JOB`, `$WT`,
   branch name. Store the name or ID in `builder`.
6. **Check build.md.** Run `bash $ROOT/.claude/skills/factory/check-build.sh $JOB $WT`. It prints:
   - `BLOCKED` → **needs-human** with the reason from build.md's first line.
   - `FAIL: …` lines → SendMessage the builder: "build.md check failed:" plus those lines verbatim,
     then "Fix them and reply." Run the check again. This isn't a review round. Still failing after
     2 attempts → **needs-human**, note "build.md check failing".
   - `READY` → **Review round**.

### Review round

1. round += 1. Move the previous `reviews` into `rounds` (if round > 1). Set every review to
   `pending`, `stage: review`. Create `$JOB/round-<round>/`.
2. Spawn all 4 reviewers **in one message, in the background**. Each gets: `$JOB`, `$WT`, the branch,
   the round number, its output file `$JOB/round-<round>/review-<key>.md`, and the line "Writing that
   output file (first line `VERDICT: PASS` or `VERDICT: CHANGES`) is required; it is the only file you write."
3. As each reviewer finishes, read the first line of its file (`VERDICT: PASS` / `VERDICT: CHANGES`)
   and update that chip on the board right away, so the dashboard fills in live.
4. **WAIT FOR ALL.** The round is done only when all 4 files exist in the round folder. Never message the
   builder mid-round. If a reviewer ended without writing its file, spawn it again.
5. Decide:
   - any `CHANGES` and `round < maxRound` → `stage: build`, then SendMessage the **same builder**:
     "Round <round> reviews are in `$JOB/round-<round>/`. Address every CHANGES review, commit,
     update build.md." Then run step 6 of the new-job flow again.
   - any `CHANGES` and `round == maxRound` → **needs-human**, note "review rounds exhausted".
   - all `PASS` → **Approve**.

If the builder can't be reached (new session, agent gone), spawn a fresh `builder` named
`builder-<id>`. Its files tell it everything it needs.

### Approve

`stage: approve`. Spawn `approver` (foreground) with: `$JOB`, `$WT`, branch, `$JOB/decision.md`, and the
line "Writing that output file (first line `APPROVE` or `ESCALATE`) is required; it is the only file you write."
Read the first line of decision.md:
- `APPROVE` → **Merge**.
- `ESCALATE` → **needs-human**, note = the approver's one-line reason.

### Merge

```sh
git -C $ROOT merge --no-ff factory/<id> -m "Merge factory/<id>: <title>"
```
- Conflict → `git -C $ROOT merge --abort`, then **needs-human** with note "merge conflict: `/factory rework <id> merge main`".
- Success → `git -C $ROOT worktree remove factory/.worktrees/<id>`, then `stage: merged`. **Keep the branch**:
  never delete it without the user's OK. **Don't push.** A push to `main` deploys to GitHub Pages,
  so tell the user it's ready to push.
- Commit the factory records on main:
  `git add factory/board.json factory/backlog.md factory/jobs/<id> && git commit -m "factory: <id> merged"`.

### needs-human

`stage: needs-human`, `note` = reason. Commit the factory records as above (`factory: <id> needs human`).
Tell the user what's wrong and which command moves the job on: `/factory approve <id>` or
`/factory rework <id> <note>`.

### `/factory next`

Take the first `- [ ]` line in `factory/backlog.md`. Change it to `- [x] … → <job-id>` as soon as the
id exists (so it's never picked twice), then run it as `/factory <that text>`. If no unchecked line
is left, say the backlog is empty.

### `/factory approve <job-id>`

Only for `stage: needs-human`. Set `note: "approved by human"` and run **Merge**.

### `/factory rework <job-id> <note>`

For any job that isn't `merged`. reworks += 1. Write the note verbatim to `$JOB/rework-<reworks>.md`
(you write this one, as the human's messenger). Recreate the worktree if it's gone (`git worktree add
factory/.worktrees/<id> factory/<id>` + the node_modules symlink). Set `maxRound = round + 1 + MAX_FIX_ROUNDS`
and `stage: build`. Resume (or respawn) `builder-<id>` pointing at `$JOB/rework-<reworks>.md`, then
continue from step 6 of the new-job flow.

## Reporting

Keep the user posted with one line per transition (`003 → review round 2`). When a job finishes,
summarise: stage, rounds, the decision, and the branch. The dashboard is
`cd factory && python3 -m http.server 8000` → <http://localhost:8000/dashboard.html>.
