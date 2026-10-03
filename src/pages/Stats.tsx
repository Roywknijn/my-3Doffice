import { formatCompact, formatDateTime, formatNumber, orderedStatuses, statusTone } from '../format.ts'
import type { DashboardSnapshot } from '../types.ts'
import { EmptyState, LoadingState } from '../ui.tsx'
import type { Page } from '../routes.ts'

function availableCount(source: { availability: string; total: number }, unit?: string) {
  return source.availability === 'available' ? `${formatNumber(source.total)}${unit ? ` ${unit}` : ''}` : 'Not Available'
}

function StatTile({ label, value, detail, onClick }: { label: string; value: string; detail?: string; onClick?: () => void }) {
  return <button type="button" className="stat-tile" onClick={onClick} disabled={!onClick}><span>{label}</span><strong className={value === 'Not Available' ? 'na' : undefined}>{value}</strong>{detail && <small>{detail}</small>}</button>
}

/** The operations overview, shown in the Office panel's Stats tab. */
export function Stats({ dashboard, pending = false, onNavigate }: { dashboard: DashboardSnapshot | null; pending?: boolean; onNavigate?: (page: Page) => void }) {
  if (pending) return <LoadingState message="Reading runtime signals..."/>
  if (!dashboard) return <EmptyState title="Not Available">The MyCompany API could not be reached. Start it with <code>npm run dev</code>.</EmptyState>
  const { runtime, tasks, calendar, activity, skills, channels, office, usage, commands } = dashboard
  const go = (page: Page) => onNavigate ? () => onNavigate(page) : undefined
  const openTasks = Object.entries(tasks.byStatus).filter(([status]) => !['done', 'archived'].includes(status)).reduce((sum, [, count]) => sum + count, 0)
  const statuses = orderedStatuses(Object.keys(tasks.byStatus))
  const insight = usage.availability === 'available' ? usage.data : null
  const topModel = insight?.models[0]
  const maxTool = Math.max(1, ...(insight?.tools.map((tool) => tool.calls) ?? [1]))
  const hermesMissing = /not installed/i.test(runtime.profiles.error?.message ?? '')

  return <div className="stats-view">
    {hermesMissing && <section className="notice" role="status"><strong>Hermes CLI not found.</strong> MyCompany reads everything through the <code>hermes</code> command. Install Hermes Agent and make sure <code>hermes</code> is on the PATH of the shell that runs <code>npm run dev</code>, then press Refresh all.</section>}
    <section className="stat-grid" aria-label="Key statistics">
      <StatTile label="Gateways running" value={`${office.gatewaysReachable} / ${office.gatewaysDeclared}`} detail="Hermes profiles" onClick={go('Agents')}/>
      <StatTile label="Crew active" value={`${office.active} / ${office.declared}`} detail={`${office.idle} idle · ${office.offline} offline · ${office.unknown} unknown`} />
      <StatTile label="Open tasks" value={tasks.availability === 'available' ? formatNumber(openTasks) : 'Not Available'} detail={tasks.availability === 'available' ? `${formatNumber(tasks.total)} total · ${tasks.byStatus.running ?? 0} running` : undefined} onClick={go('Task Board')}/>
      <StatTile label="Scheduled jobs" value={availableCount(calendar)} detail={calendar.availability === 'available' ? `${calendar.active} active · ${calendar.paused} paused` : undefined} onClick={go('Calendar')}/>
      <StatTile label="Recent sessions" value={availableCount(activity)} detail={channels.activeSessions !== undefined ? `${channels.activeSessions} active now` : 'Last 20 listed'} onClick={go('Activity')}/>
      <StatTile label="Enabled skills" value={availableCount(skills)} detail={skills.availability === 'available' ? `${Object.keys(skills.byCategory).length} categories` : undefined} onClick={go('Skills')}/>
      <StatTile label="Channels" value={availableCount(channels, 'configured')} detail={channels.availability === 'available' ? `${channels.connected} connected${channels.platformProblems ? ` · ${channels.platformProblems} with problems` : ''}` : undefined} />
      <StatTile label="CLI reads" value={formatNumber(commands.total)} detail={`${commands.failed} failed · ${commands.averageMs} ms avg`} onClick={go('Logs')}/>
    </section>

    <section className="dash-grid">
      <article className="card">
        <p className="eyebrow">USAGE · LAST {insight?.days ?? 7} DAYS</p>
        {usage.availability === 'unavailable' ? <p className="muted">Not Available — {usage.error?.message ?? 'hermes insights could not be read.'}</p> : !insight ? <p className="muted">No usage data.</p> : <>
          <dl className="metric-grid">
            <div><dt>Sessions</dt><dd>{formatNumber(insight.sessions)}</dd></div>
            <div><dt>Messages</dt><dd>{formatNumber(insight.messages)}</dd></div>
            <div><dt>Tool calls</dt><dd>{formatNumber(insight.toolCalls)}</dd></div>
            <div><dt>Total tokens</dt><dd>{formatCompact(insight.totalTokens)}</dd></div>
            <div><dt>Input / output</dt><dd>{formatCompact(insight.inputTokens)} / {formatCompact(insight.outputTokens)}</dd></div>
            <div><dt>Est. cost</dt><dd>{insight.estimatedCost ?? '—'}</dd></div>
          </dl>
          {topModel && <p className="card-note">Top model: <b>{topModel.model}</b> · {topModel.sessions} sessions · {formatCompact(topModel.tokens)} tokens</p>}
          {insight.tools.length > 0 && <div className="bar-list" aria-label="Top tools">{insight.tools.slice(0, 5).map((tool) => <div key={tool.tool}><span>{tool.tool}</span><i style={{ width: `${Math.max(4, (tool.calls / maxTool) * 100)}%` }}/><b>{formatNumber(tool.calls)}</b></div>)}</div>}
        </>}
      </article>

      <article className="card">
        <p className="eyebrow">KANBAN BY STATUS</p>
        {tasks.availability === 'unavailable' ? <p className="muted">Not Available</p> : tasks.total === 0 ? <p className="muted">No tasks on the board.</p> : <>
          <div className="stack-bar" role="img" aria-label={statuses.map((status) => `${status} ${tasks.byStatus[status]}`).join(', ')}>{statuses.map((status) => <i key={status} className={`tone-${statusTone(status)}`} style={{ flexGrow: tasks.byStatus[status] }} title={`${status}: ${tasks.byStatus[status]}`}/>)}</div>
          <ul className="legend">{statuses.map((status) => <li key={status}><i className={`tone-${statusTone(status)}`}/>{status}<b>{tasks.byStatus[status]}</b></li>)}</ul>
          <p className="card-note">{tasks.assigned} of {tasks.total} tasks have an assignee.</p>
        </>}
      </article>

      <article className="card">
        <p className="eyebrow">RUNTIME</p>
        <dl className="runtime-list">
          <div><dt>Hermes profiles</dt><dd>{runtime.profiles.availability === 'available' ? runtime.profiles.data.length : 'Not Available'}</dd></div>
          <div><dt>Gateways running</dt><dd>{runtime.profiles.availability === 'available' ? `${runtime.profiles.data.filter((profile) => profile.gateway === 'Running').length} of ${runtime.profiles.data.length}` : 'Not Available'}</dd></div>
          <div><dt>Models in use</dt><dd>{runtime.profiles.availability === 'available' ? [...new Set(runtime.profiles.data.map((profile) => profile.model).filter((model) => model !== 'Not configured'))].join(', ') || '—' : 'Not Available'}</dd></div>
        </dl>
      </article>

      <article className="card">
        <p className="eyebrow">UP NEXT</p>
        <dl className="runtime-list">
          <div><dt>Next cron run</dt><dd>{calendar.availability === 'unavailable' ? 'Not Available' : formatDateTime(calendar.nextRun)}</dd></div>
          <div><dt>Latest session</dt><dd>{activity.availability === 'unavailable' ? 'Not Available' : activity.latest ? `${activity.latest.title} · ${activity.latest.lastActive}` : '—'}</dd></div>
          <div><dt>Skill categories</dt><dd>{skills.availability === 'unavailable' ? 'Not Available' : Object.entries(skills.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category, count]) => `${category} (${count})`).join(', ') || '—'}</dd></div>
        </dl>
      </article>
    </section>
    <p className="card-note">Live reads from Hermes, cached server-side for 10 seconds and refreshed automatically.</p>
  </div>
}
