// Hermes runtime files that no `hermes` CLI command prints, read where Hermes lives:
// - <home>/gateway_state.json: written by each profile's gateway; busy iff gateway_state is
//   "running" and active_agents > 0 (gateway/status.py derive_gateway_busy);
// - <home>/cache/delegation/live/deleg_*/manifest.json: written when delegate_task starts
//   subagents (every task "running"), rewritten once with final statuses and "completed" when the
//   batch ends (tools/delegation_live_log.py). Each task-<n>.log is appended while that subagent
//   works, so its age is the liveness signal; a manifest left "running" by a crash goes stale.
// Profile homes are <root> for `default` and <root>/profiles/<name> otherwise.

/**
 * Fixed, read-only script (no request input reaches it). Prints the remote clock, the Hermes
 * root, gateway state files, and only delegation folders touched in the last 30 minutes, so old
 * history is neither transferred nor replayed. Avoids single quotes: SSH passes it quoted.
 */
export const RUNTIME_SCRIPT = `
root=\${MY_OFFICE_HERMES_ROOT:-\${HERMES_HOME:-$HOME/.hermes\${HERMES_DATA_DIR_SUFFIX:-}}}
case $root in */profiles/*) root=\${root%/profiles/*} ;; esac
printf "@@NOW %s\\n@@ROOT %s\\n" "$(date +%s)" "$root"
for f in "$root/gateway_state.json" "$root"/profiles/*/gateway_state.json; do
  [ -f "$f" ] || continue
  printf "@@FILE %s\\n" "$f"; head -c 65536 "$f"; printf "\\n"
done
find "$root/cache/delegation/live" "$root"/profiles/*/cache/delegation/live -mindepth 2 -maxdepth 2 -type f -mmin -30 2>/dev/null | while IFS= read -r f; do echo "\${f%/*}"; done | sort -u | head -n 40 | while IFS= read -r d; do
  [ -f "$d/manifest.json" ] || continue
  printf "@@FILE %s\\n" "$d/manifest.json"; head -c 65536 "$d/manifest.json"; printf "\\n"
  for f in "$d/manifest.json" "$d"/task-*.log; do
    [ -f "$f" ] && printf "@@MTIME %s %s\\n" "$(stat -c %Y "$f" 2>/dev/null || date -r "$f" +%s 2>/dev/null || echo 0)" "$f"
  done
done
exit 0
`

/** One messaging platform as the gateway last reported it (gateway/status.py write_runtime_status). */
export interface GatewayPlatformState { name: string; state: string; errorCode?: string; errorMessage?: string; updatedAt?: string }
export interface GatewayRuntime { profile: string; state?: string; activeAgents: number; platforms: GatewayPlatformState[] }
export interface DelegationTask { index: number; status: string; goal?: string; logAgeSeconds?: number }
export interface Delegation { owner: string; id: string; completed: boolean; manifestAgeSeconds?: number; tasks: DelegationTask[] }
export interface HermesRuntimeState { gateways: GatewayRuntime[]; delegations: Delegation[] }

/** A running subagent goes quiet for at most this long before it is treated as stalled. */
export const SUBAGENT_SILENT_SECONDS = 15 * 60
/** A finished subagent stays this long so its report to the owner can be seen. */
export const SUBAGENT_LINGER_SECONDS = 60

const DELEGATION_DIR = /^deleg_[A-Za-z0-9_-]{1,64}$/

function profileOf(root: string, file: string): string | undefined {
  if (!file.startsWith(`${root}/`)) return undefined
  const relative = file.slice(root.length + 1)
  return relative.match(/^profiles\/([^/]+)\//)?.[1] ?? 'default'
}

function json(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  } catch { return undefined }
}

function platformStates(value: unknown): GatewayPlatformState[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([name, entry]): GatewayPlatformState[] => {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name) || !entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const field = (key: string) => typeof record[key] === 'string' && (record[key] as string).trim() ? (record[key] as string).trim() : undefined
    const errorCode = field('error_code')
    const errorMessage = field('error_message')
    const updatedAt = field('updated_at')
    return [{ name, state: field('state') ?? 'unknown', ...(errorCode ? { errorCode } : {}), ...(errorMessage ? { errorMessage } : {}), ...(updatedAt ? { updatedAt } : {}) }]
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function parseRuntimeState(output: string): HermesRuntimeState {
  const lines = output.replace(/\r/g, '').split('\n')
  const now = Number(lines.find((line) => line.startsWith('@@NOW '))?.slice(6))
  const root = lines.find((line) => line.startsWith('@@ROOT '))?.slice(7).replace(/\/+$/, '')
  if (!Number.isFinite(now) || now <= 0 || !root) throw new Error('Unrecognized Hermes runtime output.')
  const files = new Map<string, string>()
  const mtimes = new Map<string, number>()
  let current: { path: string; body: string[] } | undefined
  const close = () => { if (current) files.set(current.path, current.body.join('\n')); current = undefined }
  for (const line of lines) {
    if (line.startsWith('@@FILE ')) { close(); current = { path: line.slice(7), body: [] }; continue }
    if (line.startsWith('@@MTIME ')) {
      close()
      const match = line.match(/^@@MTIME (\d+) (.+)$/)
      if (match && Number(match[1]) > 0) mtimes.set(match[2], Number(match[1]))
      continue
    }
    if (line.startsWith('@@')) { close(); continue }
    current?.body.push(line)
  }
  close()
  const age = (path: string) => mtimes.has(path) ? Math.max(0, now - mtimes.get(path)!) : undefined
  const gateways: GatewayRuntime[] = []
  const delegations: Delegation[] = []
  for (const [path, body] of files) {
    const profile = profileOf(root, path)
    if (!profile) continue
    const value = json(body)
    if (!value) continue
    if (path.endsWith('/gateway_state.json')) {
      const active = Number(value.active_agents)
      gateways.push({ profile, ...(typeof value.gateway_state === 'string' ? { state: value.gateway_state } : {}), activeAgents: Number.isFinite(active) && active > 0 ? Math.floor(active) : 0, platforms: platformStates(value.platforms) })
      continue
    }
    const directory = path.slice(0, -'/manifest.json'.length)
    const id = directory.slice(directory.lastIndexOf('/') + 1)
    if (!path.endsWith('/manifest.json') || !DELEGATION_DIR.test(id) || !Array.isArray(value.tasks)) continue
    const tasks = value.tasks.flatMap((task): DelegationTask[] => {
      if (!task || typeof task !== 'object') return []
      const record = task as Record<string, unknown>
      if (!Number.isInteger(record.index) || (record.index as number) < 0) return []
      const index = record.index as number
      const logAge = age(`${directory}/task-${index}.log`)
      return [{ index, status: typeof record.status === 'string' ? record.status : 'unknown', ...(typeof record.goal === 'string' && record.goal.trim() ? { goal: record.goal.trim() } : {}), ...(logAge !== undefined ? { logAgeSeconds: logAge } : {}) }]
    })
    const manifestAge = age(path)
    delegations.push({ owner: profile, id, completed: Boolean(value.completed), ...(manifestAge !== undefined ? { manifestAgeSeconds: manifestAge } : {}), tasks })
  }
  return { gateways, delegations }
}

/** Busy iff the gateway reports itself running with work in progress. */
export function gatewayBusy(state: HermesRuntimeState, profile: string): boolean {
  const gateway = state.gateways.find((item) => item.profile === profile)
  return gateway?.state === 'running' && gateway.activeAgents > 0
}

export interface Subagent { id: string; owner: string; delegation: string; index: number; status: 'working' | 'finished'; outcome?: string; goal?: string }

/**
 * Subagents worth drawing now: running ones whose transcript is still being written, and ones
 * that finished in the last minute. Anything older is history and is never replayed.
 */
export function visibleSubagents(state: HermesRuntimeState): Subagent[] {
  return state.delegations.flatMap((delegation) => delegation.tasks.flatMap((task): Subagent[] => {
    const base = { id: `${delegation.owner}/${delegation.id}/${task.index}`, owner: delegation.owner, delegation: delegation.id, index: task.index, ...(task.goal ? { goal: task.goal } : {}) }
    const running = task.status === 'running' && !delegation.completed
    if (running) return task.logAgeSeconds !== undefined && task.logAgeSeconds <= SUBAGENT_SILENT_SECONDS ? [{ ...base, status: 'working' }] : []
    if (delegation.manifestAgeSeconds === undefined || delegation.manifestAgeSeconds > SUBAGENT_LINGER_SECONDS) return []
    return [{ ...base, status: 'finished', outcome: task.status === 'running' ? 'unknown' : task.status }]
  })).sort((a, b) => a.id.localeCompare(b.id))
}
