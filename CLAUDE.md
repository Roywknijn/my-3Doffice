# CLAUDE.md

MyCompany (package/CLI name `my-office`; repo github.com/kansaok/my-office) — a **read-only** 3D virtual office + dashboard for a Hermes Agent crew. It never creates, edits or runs Hermes tasks; it only runs a fixed allowlist of `hermes` read commands and visualizes the result.

## Commands

- `npm run dev` — Express API (`tsx watch server/index.ts`, port 7777) + Vite UI (proxies `/api` → 7777)
- `npm run build` — `tsc -b` + `vite build` (→ `dist/`) + server compile (→ `build/server/`)
- `npm start` / `my-office --port N` — `bin/my-office.js` imports `build/server/index.js`; serves `dist/` too. Restart after backend changes.
- `npm test` (vitest, 20 files / 136 tests), `npm run lint`
- CI (`.github/workflows/ci.yml`): lint, test, build, `npm pack` smoke test. Release on tag `v*` must match `package.json` version; attaches `my-office.tgz` that `install.sh` downloads.

## Architecture

**Server (`server/`, Express 5, ESM, binds 127.0.0.1 only)**
- `index.ts` — routes. Generic GETs: `/api/runtime|dashboard|tasks|calendar|activity|skills|office|channels|logs|command-log`, plus `/api/sessions/:id/transcript` (only ids on the Activity list) (`?fresh=1` bypasses cache). Plus `/api/health` (returns `apiVersion`), `/api/tasks/:id?board=`, `/api/settings/connection` (GET/POST), `/api/settings/connection/test`, `/api/office/interactions` (POST, same-origin JSON only), `/api/memory`, `/api/folders`, `/api/folders/:profile/list|file?path=`.
- `my-office.ts` — the core (~1000 lines): command runner `systemRun` (execFile, never a shell; timeout 8s, 30s for ssh/docker; ssh/docker reads serialized to 1 at a time), in-memory audit log (100 entries), parsers for each `hermes` output (profile list, kanban JSON, cron list, sessions table, skills, status, insights, logs), collectors, `cachedSource` (10s TTL + shared in-flight promise + `peek()`), and office state derivation.
- Also in `my-office.ts`: `withPlatforms` adds `ChannelSnapshot.platforms` (only gateways running per both `profile list` and the file; `problem` = fatal/retrying/disconnected → HUD "Channel problems"); `collectTranscript`/`parseTranscript` (`hermes sessions export --format jsonl --session-id ID --redact -`, drops system prompt/reasoning, re-redacts, keeps last 300 messages; "not found" → null); `collectSkills` reads skills per profile (`-p <p> skills list --enabled-only`, merged with `agents[]`, 60 s cache).
- `connection-config.ts` — modes: `local` (optionally `dockerContainer` → `docker exec`) or `ssh` (optionally docker on VPS; ControlMaster reuse). Stored at `~/.config/mycompany/connection.json` (0600). `hermesInvocation()` rewrites every `hermes …` call. `HERMES_HOME` = path *inside* the Hermes environment.
- `folders.ts` — read-only per-profile file browser (`<hermesRoot>/profiles/<name>`; `default` falls back to root). Path-traversal safe, hides sensitive files (env, keys, db, credential…), 256KB preview limit, secret redaction, other agents' folders excluded. Unavailable in SSH mode.
- `memory.ts` — reads SOUL.md, `memories/MEMORY.md` & `USER.md` (entries split by `\n§\n`, limits from config.yaml), and context files (AGENTS.md, CLAUDE.md, …) via `readFolderFile`.
- `hermes-runtime.ts` — fixed read-only `RUNTIME_SCRIPT` (run via pseudo command `hermes-shell` → `hermesShellInvocation`, SSH-quoted) that dumps `gateway_state.json` + recent `cache/delegation/live/deleg_*/manifest.json` with task-log mtimes; `parseRuntimeState` (incl. per-platform state/errors), `gatewayBusy`, `visibleSubagents` (running ≤15 min log silence, finished ≤60 s). Feeds `OfficeSnapshot.subagents` (absent = unknown) and Working state.
- `office-interactions.ts` — visual-only handoff events (15–180s, in memory, idempotent by id); also parsed from `MYCOMPANY_HANDOFF {json}` markers in agent logs. See `docs/office-interactions.md` (Indonesian).
- `api-version.ts` — `API_VERSION` (now 15) **must equal** `src/api-version.ts`; bump both when the UI depends on a new/changed endpoint (UI shows "Restart needed" on mismatch).

**Agent state rules (`buildOfficeSnapshot`)** — agents = `hermes profile list` (no manual roster). Priority: explicit/overlay state → live activity / gateway `active_agents>0` / running subagents (`hermes -p <p> logs agent --since 3m` + `sessions list`; chat ⇒ Collaborating, else Working, refined by Kanban running/review task) → assigned Kanban task → active session ⇒ Collaborating → `Idle` only if runtime, board, activity all fresh (≤30s) → otherwise `Unknown` (≠ offline). Stopped gateway does not mean Offline. `getOffice`/`getDashboard` return from roster + cached `peek()` data and warm slow probes in the background (first paint never waits for Docker/SSH).

**Client (`src/`, React 19 + Vite, path routing via History API)**
- `routes.ts` pages: Office (home), Agents, Task Board, Calendar, Activity, Memory, Folders, Skills, Logs, Settings (nav groups in `App.tsx` slice this list by index — update the slices when adding a page) Paths: `/` (Office), `/task-board`, `/settings` … (`pagePath`/`pageFromLocation`); unknown paths show Office. The server's SPA fallback serves index.html for every non-`/api` path.
- `App.tsx` shell: sidebar/drawer (key `m` toggles), polls `/api/dashboard` 15s and `/api/health` 60s, theme toggle (`preferences.ts`, localStorage `mc.theme`).
- `polling.ts` `usePolling(path, ms)` + `RefreshContext`; `request-state.ts` keeps last good data marked `stale` on failure.
- `pages/Office.tsx` (overlays for Stats/TaskBoard/Calendar/Memory/Folders, lazy-loads `Office3D.tsx`; 2D fallback only without WebGL). `pages/Office3D.tsx` — @react-three/fiber scene.
- `company-layout.ts` — current 3D layout: `default` → CEO room, names containing `manager` → private rooms, others → shared staff desks, meeting room sized to crew (with live Kanban board), lounge; collision walk paths; handoff/meeting placements.
- `subagentPlacements` (company-layout.ts): briefing at owner desk 7 s → far end of meeting table → report at owner desk when finished; drawn in `Office3D.tsx` with owner's look at scale 0.8, listed in the Crew panel.
- `idle-activities.ts` `IdleDirector` — Idle agents cycle coffee (2 slots, 10s) → lounge/TV seat (4 seats, 44s) → billiards (2 slots, 26s); `rest` at desk when full. Visual only.
- `agents.ts` — deterministic avatar colors from FNV hash of profile id. `cron-calendar.ts` parses cron for the calendar. `format.ts` task status order, formatters.
- Shared 3D types live in `company-layout.ts` (`Vec3`, `Placement`, `clampTarget`); `scene3d/props.tsx` holds only the furniture the current office uses.

## Conventions

- Security invariants: browser input is never a shell argument except validated ids (`PROFILE_NAME`, `BOARD_SLUG`, `TASK_ID` regexes); everything shown passes secret redaction; never add write/execute Hermes commands.
- Every data source is `Source<T> { availability, data, error? }`; show "unavailable/stale", never invent status.
- Server parsers take an injectable `run` for tests (`server/*.test.ts` feed captured Hermes output).
- UI labels in the 3D office are Indonesian (e.g. "Rapat bersama", "Istirahat"); rest of UI is English. Code style: dense one-line functions, few comments explaining *why*.
- Env vars: `MY_OFFICE_PORT`, `MY_OFFICE_HERMES_ROOT`, installer `MY_OFFICE_HOME`/`MY_OFFICE_BIN`, `HERMES_COMMAND`, `HERMES_HOME`.
