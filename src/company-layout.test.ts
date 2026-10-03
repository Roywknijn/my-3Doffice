import { describe, expect, it } from 'vitest'
import { companyLayout, companyPlacements, companyWalkPath, deskPlacement, officeRole, subagentPlacements, subagentStart, SUBAGENT_BRIEFING_MS, walkable } from './company-layout.ts'
import type { OfficeInteraction, OfficeStation, OfficeSubagent } from './types.ts'
import { kanbanColumn } from './scene3d/company-textures.ts'

const station = (id: string, state: OfficeStation['state'] = 'Working'): OfficeStation => ({ id, name: id, role: 'Hermes profile', room: 'Workspace', roomPosition: 'assigned-desk', state, currentTask: '', recentActivity: '', activity: '', seat: 1, provenance: '', freshness: '' })
const crew = ['default', 'project-manager', 'qa-MANAGER', 'coder', 'writer'].map((id) => station(id))
const now = Date.parse('2026-10-03T10:00:00Z')
const event = (from: string, to: string): OfficeInteraction => ({ id: `${from}-${to}`, from, to, label: 'Build feature', startedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 90000).toISOString() })

describe('company office', () => {
  it('assigns default to CEO, each manager to a private room, others to shared desks', () => {
    const layout = companyLayout(crew)
    expect(officeRole('default')).toBe('ceo')
    expect(officeRole('qa-MANAGER')).toBe('manager')
    expect(layout.rooms.find((r) => r.owner === 'default')?.id).toBe('ceo')
    expect(layout.rooms.filter((r) => r.id.startsWith('manager-'))).toHaveLength(2)
    expect(layout.desks.size).toBe(5)
    expect(layout.rooms.some((r) => r.owner === 'writer')).toBe(false)
  })
  it.each([['project-manager', 'coder', 'project-manager', 'coder'], ['coder', 'project-manager', 'project-manager', 'coder'], ['coder', 'writer', 'writer', 'coder']])('routes %s → %s to host %s, visitor %s', (from, to, host, visitor) => {
    const layout = companyLayout(crew)
    const placements = companyPlacements(crew, layout, [event(from, to)], now)
    expect(placements.get(host)?.position).toEqual(deskPlacement(host, layout).position)
    const desk = layout.desks.get(host)!
    expect(placements.get(visitor)).toMatchObject({ intent: 'handoff', position: [desk[0], 0, desk[2] + 1.05] })
  })
  it('discards expired, future, unknown and offline interactions', () => {
    const layout = companyLayout(crew)
    const events = [{ ...event('coder', 'writer'), expiresAt: new Date(now).toISOString() }, { ...event('coder', 'writer'), startedAt: new Date(now + 5000).toISOString() }, event('outsider', 'default')]
    expect([...companyPlacements(crew, layout, events, now).values()].some((p) => p.intent === 'handoff')).toBe(false)
    const offline = crew.map((s) => s.id === 'coder' ? station('coder', 'Offline') : s)
    expect(companyPlacements(offline, layout, [event('coder', 'writer')], now).get('writer')?.intent).toBe('desk')
  })
  it('gives simultaneous handoffs deterministic priority without duplicating an agent', () => {
    const first = event('coder', 'writer')
    const latest = { ...event('coder', 'project-manager'), startedAt: new Date(now).toISOString() }
    const result = companyPlacements(crew, companyLayout(crew), [first, latest], now)
    expect(result.get('writer')?.intent).toBe('desk')
    expect(result.get('project-manager')?.intent).toBe('handoff')
  })
  it('seats all present agents in meetings, returns them afterward, and keeps real states unchanged', () => {
    const layout = companyLayout(crew)
    const placements = companyPlacements(crew, layout, [], now, true)
    expect(new Set([...placements.values()].map((p) => p.position.join(','))).size).toBe(crew.length)
    expect([...placements.values()].every((p) => p.intent === 'meeting' && p.seated)).toBe(true)
    expect(crew.every((s) => s.state === 'Working')).toBe(true)
    expect(companyPlacements(crew, layout, [], now).get('default')?.intent).toBe('desk')
  })
  it('scales desks, rooms and meeting capacity for a larger roster', () => {
    const many = [...crew, ...Array.from({ length: 25 }, (_, i) => station(`agent-${i}`))]
    const layout = companyLayout(many)
    expect(new Set([...layout.desks.values()].map((p) => p.join(','))).size).toBe(many.length)
    expect(layout.meetingSeats.length).toBeGreaterThanOrEqual(many.length)
    expect(layout.meetingSeats.every((p) => walkable(p.position[0], p.position[2], layout))).toBe(true)
  })
  it('routes every agent from its desk to the meeting through doors, without crossing furniture', () => {
    const layout = companyLayout(crew)
    crew.forEach((s, i) => {
      const a = deskPlacement(s.id, layout).position
      const b = layout.meetingSeats[i].position
      const path = companyWalkPath([a[0], a[2]], [b[0], b[2]], layout)
      expect(path.at(-1), s.id).toEqual([b[0], b[2]])
      let previous = [a[0], a[2]]
      for (const next of path) {
        const steps = Math.ceil(Math.hypot(next[0] - previous[0], next[1] - previous[1]) / 0.08)
        for (let n = 1; n <= steps; n++) expect(walkable(previous[0] + (next[0] - previous[0]) * n / steps, previous[1] + (next[1] - previous[1]) * n / steps, layout), `${s.id}: ${previous} → ${next}`).toBe(true)
        previous = next
      }
    })
  })
  it('routes staff to each manager and CEO and returns after handoff', () => {
    const layout = companyLayout(crew)
    for (const owner of ['default', 'project-manager', 'qa-MANAGER', 'writer']) {
      const [x, , z] = layout.desks.get(owner)!
      const home = deskPlacement('coder', layout).position
      expect(companyWalkPath([home[0], home[2]], [x, z + 1.05], layout).at(-1)).toEqual([x, z + 1.05])
      expect(companyWalkPath([x, z + 1.05], [home[0], home[2]], layout).at(-1)).toEqual([home[0], home[2]])
    }
  })
  it('groups Kanban without dropping unfamiliar statuses', () => {
    expect(['ready', 'running', 'blocked', 'done', 'custom'].map(kanbanColumn)).toEqual([0, 1, 2, 3, 0])
  })
})

describe('subagents', () => {
  const layout = companyLayout(crew)
  const sub = (index: number, status: OfficeSubagent['status'] = 'working'): OfficeSubagent => ({ id: `coder/deleg_a/${index}`, owner: 'coder', delegation: 'deleg_a', index, status, ...(status === 'finished' ? { outcome: 'completed' } : {}), goal: `Goal ${index}` })

  it('briefs a new subagent at its owner desk, then seats it at the far end of the meeting table', () => {
    const subagents = [sub(0), sub(1)]
    const seen = new Map(subagents.map((s) => [s.id, now]))
    const briefing = subagentPlacements(subagents, layout, seen, now + 1000)
    const desk = layout.desks.get('coder')!
    expect(briefing.get(sub(0).id)).toMatchObject({ intent: 'handoff', label: 'Menerima tugas dari coder' })
    expect(Math.abs(briefing.get(sub(0).id)!.position[2] - (desk[2] + 1.05))).toBeLessThan(0.01)
    const working = subagentPlacements(subagents, layout, seen, now + SUBAGENT_BRIEFING_MS)
    const seats = layout.meetingSeats
    expect(working.get(sub(0).id)).toMatchObject({ intent: 'desk', label: 'Subagen · Goal 0', position: seats[seats.length - 1].position })
    expect(working.get(sub(1).id)?.position).toEqual(seats[seats.length - 2].position)
  })

  it('sends a finished subagent back to report and ignores unknown owners', () => {
    const placements = subagentPlacements([sub(0, 'finished'), { ...sub(1), owner: 'ghost' }], layout, new Map(), now)
    expect(placements.get(sub(0).id)).toMatchObject({ intent: 'handoff', label: 'Melapor ke coder · completed' })
    expect(placements.has(sub(1).id)).toBe(false)
    expect(subagentStart('coder', layout)).toEqual([layout.desks.get('coder')![0], 0, layout.desks.get('coder')![2] + 1.05])
  })

  it('keeps every subagent seat walkable', () => {
    const many = Array.from({ length: 12 }, (_, i) => sub(i))
    const placements = subagentPlacements(many, layout, new Map(many.map((s) => [s.id, now - SUBAGENT_BRIEFING_MS])), now)
    for (const placement of placements.values()) expect(walkable(placement.position[0], placement.position[2], layout)).toBe(true)
  })
})
