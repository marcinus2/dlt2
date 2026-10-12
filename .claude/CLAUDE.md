# Drone Lap Counter

Browser PWA that counts drone laps by detecting motion in a camera ROI. App lives in `app/`.

- Spec: [docs/final/SPEC-v1.0.0.md](../docs/final/SPEC-v1.0.0.md). Plan (historical): [docs/final/PLAN-v1.0.0.md](../docs/final/PLAN-v1.0.0.md).
- Backlog: [docs/final/backlog.md](../docs/final/backlog.md) — `[ ]` open, `[x]` done; add new items there. Each non-trivial feature gets a spec in `docs/final/specs/<slug>.md` (written before implementation, linked from its backlog entry); update the main spec only where behaviour changes.

## Stack

TypeScript strict, React 19, Vite 8, Tailwind v4 (tokens in `src/styles/index.css` `@theme`), `motion`, Zustand, `lucide-react`, `vite-plugin-pwa`, Vitest (+ happy-dom, Testing Library), Playwright, Biome 2. Node 22 (`app/.nvmrc`).
Any other dependency needs a reason in the PR.

## Commands (run in `app/`)

- `npm run dev` — HTTPS dev server on the LAN (`https://<lan-ip>:5173`, accept the cert on the phone)
- `npm run build` · `npm run preview`
- `npm run lint` (`biome ci`) · `npm run format` · `npm run typecheck` · `npm test` · `npm run size` (≤ 130 KB gz initial JS)
- `npm run test:e2e` (Playwright, needs a build). On macOS 14 the local WebKit fails; use `--project=chromium` locally.
- CI (`.github/workflows/ci.yml`, on PRs and `main`) = `lint → typecheck → test --coverage → build → size → e2e`; every green push to `main` deploys to GitHub Pages (https://marcinus2.github.io/dlt2/).
- URL flags: `?sim=1` (simulated engine/camera, shows `SIMULATED` chip), `?gallery` / `?state=<preset>` (state gallery, `src/ui/gallery/presets.ts`), `?debug=1` (console logs, Configuration › Diagnostics).

## Module boundaries (enforced by Biome `noRestrictedImports` / `noRestrictedGlobals`)

- `engine/`, `session/`, `settings/` (except `storage.ts`), `sim/`, `app/machine.ts`: no React, no UI libs, no `ui/`.
- `engine/*` outside `engine/browser/`: no DOM globals.
- `ui/` never imports `engine/browser` or `sim/` (go through the store).
- No `node:*` imports in `src/`.

## Rules

- Pure modules ship with their tests in the same task. Every task ends runnable, CI green, committed.
- No per-frame allocation in the frame loop. React never renders per frame: store updates ≤ 4 Hz.
- Gesture-bound effects (`audio.unlock`, `camera.start`) run synchronously inside `dispatch` from the tap handler — no `await` before them.
- Times come from frame timestamps (`performance.now()` / `mediaTime·1000`), never `Date`.
- Colours only from the tokens (default Tailwind palette is disabled). Dark only, neon accents; red only for critical actions.
- `vite.config.ts` keeps `base: './'`. localStorage keys always prefixed `dronelap.`.
- Workflow: branch `feat/<slug>` / `fix/<slug>`, PR into `main`, deploy on merge, check on a phone (footer shows version + git SHA).
- Keep code and comments concise; match the existing style.
- Never delete a git branch without the user's explicit acceptance first.
- Never add Claude-related info to git commit messages (no `Co-Authored-By: Claude`).
