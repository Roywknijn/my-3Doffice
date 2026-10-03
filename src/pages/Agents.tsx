import { agentLabel, platformTone } from '../format.ts'
import type { ChannelSnapshot, OfficeSnapshot, RuntimeSnapshot } from '../types.ts'
import { usePolling } from '../polling.ts'
import { EmptyState, LoadingState, PageTitle, RuntimeBadge } from '../ui.tsx'
import { PixelCharacter } from './Office.tsx'

/** Every Hermes profile on this machine is an agent. */
export function Agents({ runtime, pending = false }: { runtime: RuntimeSnapshot | null; pending?: boolean }) {
  const office = usePolling<OfficeSnapshot>('/api/office', 15_000)
  const channels = usePolling<ChannelSnapshot>('/api/channels', 30_000)
  const platforms = channels.status === 'ready' ? channels.data.platforms : undefined
  if (pending) return <><PageTitle eyebrow="CREW" title="Agents"/><LoadingState message="Reading runtime details..."/></>
  if (!runtime || runtime.profiles.availability === 'unavailable') return <><PageTitle eyebrow="CREW" title="Agents"/><EmptyState title="Not Available">The Hermes profile list could not be read. Is <code>hermes</code> on the PATH of the server?</EmptyState></>
  const states = new Map(office.status === 'ready' ? office.data.stations.map((station) => [station.id, station]) : [])
  const cards = runtime.profiles.data.map((profile) => ({ id: profile.name, kind: 'Hermes profile', model: profile.model, gateway: profile.gateway }))
  return <><PageTitle eyebrow="CREW" title="Agents">Every Hermes profile on this machine (from <code>hermes profile list</code>) is an agent. Nothing is configured by hand: new profiles appear here and in the office automatically.</PageTitle>
    <section className="agent-grid">{cards.map((card) => {
      const station = states.get(card.id)
      return <article className="agent-card" key={card.id}>
        <span className="folder-glyph" aria-hidden="true"><PixelCharacter agent={card.id}/></span>
        <div className="agent-card-body">
          <h2>{agentLabel(card.id)}</h2>
          <p className="muted">{card.kind}</p>
          <dl>
            <div><dt>Model</dt><dd>{card.model}</dd></div>
            <div><dt>Gateway</dt><dd><RuntimeBadge source={{ availability: 'available', data: card.gateway }}/></dd></div>
            {platforms && platforms.some((platform) => platform.profile === card.id) && <div><dt>Platforms</dt><dd className="platform-badges">{platforms.filter((platform) => platform.profile === card.id).map((platform) => <span key={platform.name} className={`badge ${platformTone(platform.state)}`} title={platform.error}>{platform.name} · {platform.state}</span>)}</dd></div>}
            <div><dt>In the office</dt><dd>{station ? `${station.state}${station.activity ? ` · ${station.activity}` : ''}` : '—'}</dd></div>
          </dl>
        </div>
      </article>
    })}</section>
  </>
}
