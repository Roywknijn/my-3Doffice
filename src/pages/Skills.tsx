import { useState } from 'react'
import { usePolling } from '../polling.ts'
import type { SkillsSnapshot, Skill } from '../types.ts'
import { EmptyState, PageTitle, SearchInput, SourceStatus, Unavailable } from '../ui.tsx'

/** Enabled Hermes skills of every profile, grouped by category. */
export function Skills() {
  const snapshot = usePolling<SkillsSnapshot>('/api/skills', 60_000)
  const [query, setQuery] = useState('')
  const [agent, setAgent] = useState('')
  const data = snapshot.status === 'ready' ? snapshot.data : undefined
  const skills = data?.skills
  const agents = [...new Set((skills?.data ?? []).flatMap((skill) => skill.agents ?? []))].sort()
  const needle = query.trim().toLowerCase()
  const visible = (skills?.data ?? []).filter((skill) => (!agent || skill.agents?.includes(agent)) && (!needle || `${skill.name} ${skill.category} ${skill.source}`.toLowerCase().includes(needle)))
  const groups = visible.reduce<Map<string, Skill[]>>((map, skill) => map.set(skill.category || 'uncategorized', [...(map.get(skill.category || 'uncategorized') ?? []), skill]), new Map())
  return <><PageTitle eyebrow="CAPABILITIES" title="Skills">Enabled skills of every Hermes profile (<code>hermes -p &lt;profile&gt; skills list --enabled-only</code>). Skills are installed per profile, so each one shows which agents can use it.</PageTitle>
    <SourceStatus source={skills} fetchedAt={data?.fetchedAt} request={snapshot}/><Unavailable source={skills} request={snapshot}/>
    {data?.failedProfiles && <p className="file-notice">Skills of {data.failedProfiles.join(', ')} could not be read; they are left out.</p>}
    {skills?.availability === 'available' && (skills.data.length === 0 ? <EmptyState title="No enabled skills">Install or enable one with <code>hermes skills</code>.</EmptyState> : <>
      <div className="toolbar"><SearchInput value={query} onChange={setQuery} label="Search skills"/>
        {agents.length > 1 && <select className="search-input skill-agent-filter" value={agent} onChange={(event) => setAgent(event.target.value)} aria-label="Filter by agent"><option value="">All agents</option>{agents.map((name) => <option key={name} value={name}>{name}</option>)}</select>}
        <span className="toolbar-count">{visible.length} of {skills.data.length}</span></div>
      {visible.length === 0 ? <EmptyState title="No matching skills">Try another search or agent.</EmptyState> : [...groups].map(([category, items]) => <section key={category} className="skill-group"><p className="eyebrow">{category.toUpperCase()} · {items.length}</p>
        <ul className="skill-list">{items.map((skill) => <li key={skill.name}><b>{skill.name}</b><span className="chip">{skill.source}{skill.trust !== skill.source ? ` · ${skill.trust}` : ''}</span>{skill.agents && <span className="skill-agents">{agents.length > 1 && skill.agents.length === agents.length ? <span className="chip chip-muted">all agents</span> : skill.agents.map((name) => <span key={name} className="chip chip-muted">{name}</span>)}</span>}</li>)}</ul>
      </section>)}
    </>)}
  </>
}
