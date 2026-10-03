import type { OfficeStation, OfficeInteraction, OfficeSubagent } from './types.ts'
import type { IdleActivity } from './idle-activities.ts'

export type Vec3 = [number, number, number]
export interface Placement { position: Vec3; facing: number; seated: boolean; label?: string }
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface CompanyRoom extends Rect { id: string; label: string; owner?: string; door: [number, number] }
export interface CompanyLayout {
  deskCount: number
  rooms: CompanyRoom[]
  desks: Map<string, Vec3>
  walls: Rect[]
  obstacles: Rect[]
  meeting: CompanyRoom
  meetingSeats: Placement[]
  table: { center: Vec3; length: number }
  loungeX: number
  bounds: Rect
  camera: { target: Vec3; offset: Vec3 }
  pan: Rect
}

export function officeRole(id: string): 'ceo' | 'manager' | 'staff' {
  return id.toLowerCase() === 'default' ? 'ceo' : /manager/i.test(id) ? 'manager' : 'staff'
}

export function companyLayout(stations: Pick<OfficeStation, 'id'>[]): CompanyLayout {
  const managers = stations.filter((s) => officeRole(s.id) === 'manager')
  const staff = stations.filter((s) => officeRole(s.id) === 'staff')
  const columns = Math.max(3, Math.ceil(staff.length / 2))
  const workWidth = Math.max(columns * 2.8 + 1.2, managers.length * 5.4, 10)
  const loungeX = workWidth + 1.5
  const bounds = { minX: -8, maxX: loungeX + 7.5, minZ: -7.5, maxZ: 8 }
  const rooms: CompanyRoom[] = [{ id: 'ceo', label: 'CEO · DEFAULT', owner: stations.find((s) => officeRole(s.id) === 'ceo')?.id, minX: -8, maxX: -1, minZ: 1.4, maxZ: 8, door: [-1, 5.8] }]
  const meeting: CompanyRoom = { id: 'meeting', label: 'RUANG RAPAT', minX: -8, maxX: -1, minZ: -7.5, maxZ: -0.3, door: [-1, -1.6] }
  // A long meeting room grows with the crew so every participant gets a distinct chair.
  const meetingRows = Math.max(4, Math.ceil(stations.length / 2))
  const meetingLength = Math.max(3.7, meetingRows * 0.85)
  const rear = Math.min(bounds.minZ, -0.3 - meetingLength - 2.4)
  meeting.minZ = rear
  bounds.minZ = rear
  rooms.push(meeting)
  managers.forEach((s, i) => rooms.push({ id: `manager-${s.id}`, label: s.id, owner: s.id, minX: 0.4 + i * 5.4, maxX: 5.8 + i * 5.4, minZ: rear, maxZ: -2.8, door: [3.8 + i * 5.4, -2.8] }))
  const desks = new Map<string, Vec3>()
  for (const room of rooms.filter((r) => r.id !== 'meeting')) if (room.owner) desks.set(room.owner, [(room.minX + room.maxX) / 2, 0, room.id === 'ceo' ? 4.5 : -5.3])
  staff.forEach((s, i) => desks.set(s.id, [1.7 + (i % columns) * 2.8, 0, i < columns ? -0.5 : 3.3]))
  const walls: Rect[] = []
  const wallX = (x: number, z0: number, z1: number) => { if (z1 > z0) walls.push({ minX: x - 0.06, maxX: x + 0.06, minZ: z0, maxZ: z1 }) }
  const wallZ = (z: number, x0: number, x1: number) => { if (x1 > x0) walls.push({ minX: x0, maxX: x1, minZ: z - 0.06, maxZ: z + 0.06 }) }
  for (const room of rooms) {
    if (room.id === 'ceo' || room.id === 'meeting') {
      wallX(room.maxX, room.minZ, room.door[1] - 0.65)
      wallX(room.maxX, room.door[1] + 0.65, room.maxZ)
      wallZ(room.id === 'ceo' ? room.minZ : room.maxZ, room.minX, room.maxX)
    } else {
      wallX(room.minX, room.minZ, room.maxZ)
      wallX(room.maxX, room.minZ, room.maxZ)
      wallZ(room.maxZ, room.minX, room.door[0] - 0.65)
      wallZ(room.maxZ, room.door[0] + 0.65, room.maxX)
    }
  }
  const table = { center: [-4.5, 0, (meeting.minZ + meeting.maxZ) / 2] as Vec3, length: meetingLength }
  const meetingSeats: Placement[] = Array.from({ length: Math.max(8, stations.length) }, (_, i) => ({ position: [-4.5 + (i % 2 ? 1.65 : -1.65), 0, table.center[2] - meetingLength / 2 + 0.4 + Math.floor(i / 2) * 0.85], facing: i % 2 ? -Math.PI / 2 : Math.PI / 2, seated: true }))
  const obstacles: Rect[] = [...walls, ...[...desks.values()].map(([x, , z]) => ({ minX: x - 1, maxX: x + 1, minZ: z - 0.5, maxZ: z + 0.5 })), { minX: -5.5, maxX: -3.5, minZ: table.center[2] - meetingLength / 2, maxZ: table.center[2] + meetingLength / 2 }, { minX: loungeX + 1.8, maxX: loungeX + 4.2, minZ: 1.75, maxZ: 2.65 }, { minX: loungeX + 1.5, maxX: loungeX + 5.3, minZ: 4.2, maxZ: 6.3 }, { minX: 4.9, maxX: 6.9, minZ: 5.8, maxZ: 7.4 }]
  const width = bounds.maxX - bounds.minX
  // Fixed decoration with a physical footprint: navigation must also avoid these pieces.
  obstacles.push(
    { minX: loungeX + 0.6, maxX: loungeX + 5.9, minZ: -1.3, maxZ: -1.1 },
    { minX: loungeX + 2.075, maxX: loungeX + 3.925, minZ: 0.425, maxZ: 1.575 },
    { minX: loungeX + 1.42, maxX: loungeX + 1.88, minZ: 0.82, maxZ: 1.28 },
    { minX: loungeX + 4.42, maxX: loungeX + 4.88, minZ: 0.82, maxZ: 1.28 },
    { minX: loungeX + 0.35, maxX: loungeX + 1.25, minZ: 0.75, maxZ: 1.65 },
    { minX: loungeX + 5.05, maxX: loungeX + 5.95, minZ: 0.75, maxZ: 1.65 },
    { minX: loungeX + 0.65, maxX: loungeX + 6.35, minZ: rear + 0.5, maxZ: rear + 1.6 },
    { minX: -6.15, maxX: -5.25, minZ: 5.95, maxZ: 6.85 },
    { minX: -3.75, maxX: -2.85, minZ: 5.95, maxZ: 6.85 },
  )
  const depth = bounds.maxZ - bounds.minZ
  return { deskCount: stations.length, rooms, desks, walls, obstacles, meeting, meetingSeats, table, loungeX, bounds, camera: { target: [(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2], offset: [0, Math.max(width * 0.62, depth), Math.max(width * 0.85, depth * 1.4)] }, pan: { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ } }
}

export function deskPlacement(id: string, layout: CompanyLayout, seated = true): Placement {
  const [x, , z] = layout.desks.get(id) ?? [0, 0, 0]
  return { position: [x, 0, z - 0.9], facing: 0, seated }
}

export interface CompanyPlacement extends Placement { intent: 'desk' | 'idle' | 'meeting' | 'handoff'; label: string; approach?: Vec3; idle?: IdleActivity }

/** Participants in a handoff go to the manager's office, otherwise the recipient's desk. */
export function companyPlacements(stations: OfficeStation[], layout: CompanyLayout, interactions: OfficeInteraction[], now: number, meeting = false): Map<string, CompanyPlacement> {
  const result = new Map<string, CompanyPlacement>()
  for (const s of stations) {
    if (s.state === 'Idle') {
      result.set(s.id, { ...deskPlacement(s.id, layout), intent: 'idle', label: 'Istirahat' })
    } else result.set(s.id, { ...deskPlacement(s.id, layout, s.state !== 'Offline'), intent: 'desk', label: officeRole(s.id) === 'ceo' ? 'Ruang CEO' : officeRole(s.id) === 'manager' ? 'Ruang manager' : 'Meja kerja' })
  }
  const taken = new Set<string>()
  const visits = new Map<string, number>()
  for (const event of [...interactions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
    if (!(Date.parse(event.startedAt) <= now && Date.parse(event.expiresAt) > now) || !result.has(event.from) || !result.has(event.to) || event.from === event.to || taken.has(event.from) || taken.has(event.to) || stations.some((s) => [event.from, event.to].includes(s.id) && s.state === 'Offline')) continue
    const owner = officeRole(event.from) === 'manager' ? event.from : event.to
    const visitor = owner === event.from ? event.to : event.from
    const [x, , z] = layout.desks.get(owner)!
    const n = visits.get(owner) ?? 0
    visits.set(owner, n + 1)
    result.set(owner, { ...deskPlacement(owner, layout), intent: 'handoff', label: `Diskusi tugas · ${visitor}` })
    result.set(visitor, { position: [x + n * 0.65, 0, z + 1.05], facing: Math.PI, seated: false, intent: 'handoff', label: `Bertemu ${owner} · ${event.label}` })
    taken.add(event.from); taken.add(event.to)
  }
  if (meeting) stations.forEach((s, i) => { if (s.state !== 'Offline') result.set(s.id, { ...layout.meetingSeats[i], intent: 'meeting', label: 'Rapat bersama · ruang rapat' }) })
  return result
}

const CLEARANCE = 0.22
export function walkable(x: number, z: number, layout: CompanyLayout): boolean {
  const b = layout.bounds
  return x > b.minX + CLEARANCE && x < b.maxX - CLEARANCE && z > b.minZ + CLEARANCE && z < b.maxZ - CLEARANCE && !layout.obstacles.some((o) => x > o.minX - CLEARANCE && x < o.maxX + CLEARANCE && z > o.minZ - CLEARANCE && z < o.maxZ + CLEARANCE)
}

/** A grid route uses the very same wall and furniture bounds as the rendered scene. */
export function companyWalkPath(from: [number, number], to: [number, number], layout: CompanyLayout): [number, number][] {
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.08) return []
  const clear = (a: [number, number], b: [number, number]) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1)
    for (let i = 1; i <= steps; i++) if (!walkable(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps, layout)) return false
    return true
  }
  if (clear(from, to)) return [to]
  const step = 0.35
  const width = Math.ceil((layout.bounds.maxX - layout.bounds.minX) / step)
  const height = Math.ceil((layout.bounds.maxZ - layout.bounds.minZ) / step)
  const point = (key: number): [number, number] => [layout.bounds.minX + (key % width) * step, layout.bounds.minZ + Math.floor(key / width) * step]
  const nearest = (p: [number, number]) => {
    let best = -1; let distance = Infinity
    for (let key = 0; key < width * height; key++) {
      const q = point(key); const d = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (d < distance && walkable(...q, layout) && clear(p, q)) { best = key; distance = d }
    }
    return best
  }
  const start = nearest(from); const end = nearest(to)
  if (start < 0 || end < 0) return []
  const open = new Set([start]); const closed = new Set<number>(); const costs = new Map([[start, 0]]); const parent = new Map<number, number>()
  while (open.size) {
    let key = start; let score = Infinity
    for (const k of open) { const p = point(k); const s = costs.get(k)! + Math.hypot(p[0] - to[0], p[1] - to[1]); if (s < score) { key = k; score = s } }
    if (key === end) {
      const route: [number, number][] = [to, point(key)]
      while (parent.has(key)) { key = parent.get(key)!; route.push(point(key)) }
      route.push(from); route.reverse()
      const smooth: [number, number][] = []; let i = 0
      while (i < route.length - 1) { let j = route.length - 1; while (j > i + 1 && !clear(route[i], route[j])) j--; smooth.push(route[j]); i = j }
      return smooth
    }
    open.delete(key); closed.add(key)
    const p = point(key)
    for (const offset of [-1, 1, -width, width]) {
      const next = key + offset
      if (next < 0 || next >= width * height || closed.has(next)) continue
      const q = point(next)
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > step * 1.01 || !clear(p, q)) continue
      const cost = costs.get(key)! + step
      if (cost < (costs.get(next) ?? Infinity)) { parent.set(next, key); costs.set(next, cost); open.add(next) }
    }
  }
  return []
}

/** How long a new subagent stands at its owner's desk being briefed before it starts work. */
export const SUBAGENT_BRIEFING_MS = 7000

/**
 * Subagents of a delegate_task call: briefed at the owner's desk, then working at the meeting
 * table (filled from the far end, so crew meeting seats stay free), then reporting back to the
 * owner once finished. `firstSeen` is when this browser first saw each subagent.
 */
export function subagentPlacements(subagents: OfficeSubagent[], layout: CompanyLayout, firstSeen: ReadonlyMap<string, number>, now: number): Map<string, CompanyPlacement> {
  const result = new Map<string, CompanyPlacement>()
  const visitors = new Map<string, number>()
  let seated = 0
  for (const subagent of subagents) {
    const desk = layout.desks.get(subagent.owner)
    if (!desk) continue
    const briefing = subagent.status === 'working' && now - (firstSeen.get(subagent.id) ?? now) < SUBAGENT_BRIEFING_MS
    if (subagent.status === 'finished' || briefing) {
      const n = visitors.get(subagent.owner) ?? 0
      visitors.set(subagent.owner, n + 1)
      const position: Vec3 = [desk[0] + ((n % 3) - 1) * 0.65, 0, desk[2] + 1.05 + Math.floor(n / 3) * 0.6]
      result.set(subagent.id, { position, facing: Math.PI, seated: false, intent: 'handoff', label: briefing ? `Menerima tugas dari ${subagent.owner}` : `Melapor ke ${subagent.owner} · ${subagent.outcome ?? 'selesai'}` })
      continue
    }
    const seats = layout.meetingSeats
    const k = seated++
    const seat = k < seats.length ? seats[seats.length - 1 - k] : { ...seats[0], position: [layout.table.center[0] + ((k % 2) ? 2.3 : -2.3), 0, layout.table.center[2] - layout.table.length / 2 + (k - seats.length) * 0.6] as Vec3, seated: false }
    result.set(subagent.id, { ...seat, intent: 'desk', label: `Subagen · ${subagent.goal ?? 'tugas delegasi'}` })
  }
  return result
}

/** Where a subagent appears: beside its owner's desk, where it is briefed. */
export function subagentStart(owner: string, layout: CompanyLayout): Vec3 {
  const [x, , z] = layout.desks.get(owner) ?? [0, 0, 0]
  return [x, 0, z + 1.05]
}

/** Keeps the camera target inside the panning bounds. */
export function clampTarget(x: number, z: number, bounds: Rect): [number, number] {
  return [Math.min(Math.max(x, bounds.minX), bounds.maxX), Math.min(Math.max(z, bounds.minZ), bounds.maxZ)]
}
