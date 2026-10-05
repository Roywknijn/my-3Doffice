# StoneBox SaaS AI+ERP · Hermes 3D Virtual Office

> Developed by Roy W Knijn @Copyright 2026 PT StoneBox Ananta Integrasi

StoneBox SaaS AI+ERP is a read-only 3D workspace for a Hermes Agent team. It turns the agents discovered from Hermes into a living office: see who is active, inspect Kanban work, schedules, sessions, memory, folders, logs, and visualize collaboration without sending tasks or commands to an agent.

Repository: [github.com/kansaok/my-office](https://github.com/kansaok/my-office)

## What it does

- Presents one responsive 3D office as the workspace home. A basic 2D fallback is shown only when the browser has no WebGL support.
- Assigns a CEO room to the `default` agent, private rooms to agents whose name contains `manager`, a shared staff area for everyone else, and a meeting room with a live Kanban board.
- Visualizes working, idle, unknown, review, collaboration, meetings, handoffs, coffee, lounge, TV, conversation, and billiard activity. These animations are visual only.
- Reads Hermes profiles, Kanban boards, cron jobs, sessions, skills, channels, usage, and redacted logs. It never creates, edits, or executes a Hermes task.
- Connects to Hermes on the same machine, in a local Docker container, on a VPS over SSH, or in a Docker container on that VPS.

## Requirements

- Node.js 20 or later for a source installation.
- Hermes Agent available either locally or on the target VPS.
- A modern WebGL-capable browser for the 3D office.
- For Docker-based Hermes, the user that runs StoneBox SaaS AI+ERP must be allowed to run `docker exec`.
- For a remote VPS, SSH key or SSH-agent access from the machine running StoneBox SaaS AI+ERP to the VPS.

## Install and run

### From the installer

```bash
curl -fsSL https://raw.githubusercontent.com/kansaok/my-office/main/install.sh | bash
my-office
```

The command is `my-office`. It installs under `~/.local/share/my-office` and exposes the command from `~/.local/bin`.

For a Linux user service, add `--service` to the installer command. Run the installer again to update, or add `--uninstall` to remove it.

### From source

```bash
git clone https://github.com/kansaok/my-office.git
cd my-office
npm install
npm run build
npm start
```

Open `http://127.0.0.1:7777`. The server binds to localhost only. Port 7777 is the default; choose another with `--port <n>` (for example `npm start -- --port 8080`) or the `MY_OFFICE_PORT` environment variable.

For development:

```bash
npm run dev
```

The API runs on port 7777 and Vite prints the UI URL (it proxies `/api` to port 7777).

## Connect Hermes

Open **Settings** in StoneBox SaaS AI+ERP, choose the connection mode, then use **Test connection** before saving.

| Scenario | Mode and fields |
| --- | --- |
| Hermes installed on the same host | **Local server**; set `Hermes executable` to `hermes` or its absolute path. |
| Hermes in local Docker | **Local server**; set Docker container (for example `hermes`). Set Hermes data directory only if the container uses a non-default `HERMES_HOME`. |
| StoneBox SaaS AI+ERP local, Hermes on VPS | **Remote VPS via SSH**; set VPS host, SSH user, port, and optionally the absolute private-key path. |
| Hermes in Docker on the VPS | Use **Remote VPS via SSH** and also fill Docker container. The SSH user needs Docker permission on the VPS. |

`Hermes data directory` is the directory **inside the Hermes environment** that should be passed as `HERMES_HOME` (for example `/opt/data` in a Docker container). Leave it empty when Hermes already uses its normal default. A private-key path must be absolute and refers to the machine that runs StoneBox SaaS AI+ERP, not to the VPS.

The connection configuration is stored with mode `0600` at `~/.config/mycompany/connection.json` for the OS user running StoneBox SaaS AI+ERP. In remote mode, the Folder and Memory pages are unavailable because their files are not copied over SSH.

## Office behavior

StoneBox SaaS AI+ERP discovers agents from `hermes profile list`; no crew is configured by hand. An agent's status is based on recent, attributable Hermes evidence:

- **Working / Reviewing**: an assigned running or review Kanban task, recent tool, cron, or agent activity, a running gateway whose `gateway_state.json` reports `active_agents > 0`, or a running `delegate_task` subagent.
- **Collaborating**: a recent attributable chat/session signal or an active visual handoff.
- **Idle**: all required sources are fresh and no active work is found. Idle agents can make coffee, relax in the TV lounge, talk, drink coffee, or play billiards.
- **Unknown**: StoneBox SaaS AI+ERP lacks enough fresh evidence to make a truthful decision. It does not mean that the agent is offline.

The Office opens as soon as its agent roster is available. Detail probes for logs, sessions, and boards warm in the background, so a slow Docker or SSH command does not hold the 3D view on “Reading office state”. A following poll enriches the activity state.

Subagents started with Hermes `delegate_task` appear automatically: StoneBox SaaS AI+ERP reads each profile's `cache/delegation/live/deleg_*/manifest.json` (only folders touched in the last 30 minutes) together with `gateway_state.json`, through one fixed read-only `sh` script run where Hermes lives (locally, `docker exec`, or SSH). A subagent is briefed at its owner's desk, works at the meeting table while its transcript log is being written (up to 15 minutes of silence), and reports back for one minute after it finishes. Older delegations are never replayed.

The **Rapat bersama** action and agent handoffs affect the visualization only. They do not instruct Hermes to start work. To feed real delegation into the visual office, see [office interaction integration](docs/office-interactions.md).

## Pages

- **Overview**: 3D office (including `delegate_task` subagents), office HUD (with a channel-problem alert), crew/stats/activity side panel (gateway platform state per profile), and task/calendar overlays.
- **Agents**: detected Hermes profiles, model, gateway state, live gateway platform state (from `gateway_state.json`, with errors), and current office state.
- **Task board**: read-only Kanban boards and task details.
- **Calendar**: cron schedules and upcoming runs across profiles.
- **Activity**: recent Hermes sessions, each with a read-only transcript (`hermes sessions export --redact`; secrets redacted again, system prompt and reasoning hidden, last 300 messages).
- **Memory and Folders**: read-only, access-controlled agent files for a local Hermes connection.
- **Skills**: enabled skills of every profile, grouped by category, with the agents that have each one.
- **Logs**: redacted Hermes logs and a StoneBox SaaS AI+ERP command audit.
- **Settings**: local, Docker, SSH, and remote Docker connection configuration.

## Security and privacy

StoneBox SaaS AI+ERP uses a fixed allowlist of read commands. Browser input is never used as a shell command. Logs and file previews pass through secret redaction; credentials, keys, databases, environment files, and binary files are not exposed. The 3D office does not control Hermes.

The server caches command results and shares in-flight reads. This avoids repeatedly starting the same Hermes command during page polling. If a source fails, the UI keeps the last successful data where possible and labels it stale or unavailable rather than inventing status.

## Development checks

```bash
npm run lint
npm test
npm run build
```

After changing backend code, restart `npm start`; the running production process continues to use the previously built server until restarted.

## License

See the repository for licensing information.
