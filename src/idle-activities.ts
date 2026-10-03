import { companyWalkPath, deskPlacement, walkable, type CompanyLayout, type CompanyPlacement, type Vec3 } from './company-layout.ts'

export type IdleAction = 'coffee' | 'lounge' | 'billiards' | 'rest'
export interface IdleActivity {
  action: IdleAction; slot: number; token: string; arrivedAt?: number
  table?: Vec3; peer?: Vec3
}
interface Visit extends IdleActivity { seat?: number }
export interface LoungeSeat { position: Vec3; approach: Vec3; facing: number; table: Vec3 }

export function loungeSeats(layout: CompanyLayout): LoungeSeat[] {
  const x = layout.loungeX
  return [
    { position: [x + 2.45, 0, 2.15], approach: [x + 1.5, 0, 1.55], facing: Math.PI, table: [x + 2.2, 0.53, 1.5] },
    { position: [x + 3.55, 0, 2.15], approach: [x + 4.5, 0, 1.55], facing: Math.PI, table: [x + 3.3, 0.53, 1.5] },
    { position: [x + 0.8, 0, 1.2], approach: [x + 0.8, 0, 2.05], facing: Math.PI / 2, table: [x + 1.65, 0.53, 1.05] },
    { position: [x + 5.5, 0, 1.2], approach: [x + 5.5, 0, 2.05], facing: -Math.PI / 2, table: [x + 4.65, 0.53, 1.05] },
  ]
}

/** Each visit lasts from actual arrival, not from a global clock slot. Seats are reserved
 * before brewing, so the agent can always take its own coffee to an available chair. */
export class IdleDirector {
  private visits = new Map<string, Visit>()
  private sequence = 0
  constructor(private layout: CompanyLayout) {}

  update(base: Map<string, CompanyPlacement>, arrivals: ReadonlyMap<string, string>, now: number) {
    for (const id of this.visits.keys()) if (base.get(id)?.intent !== 'idle') this.visits.delete(id)
    const used = (action: IdleAction) => new Set([...this.visits.values()].filter((v) => v.action === action).map((v) => v.slot))
    const free = (set: Set<number>, count: number) => Array.from({ length: count }, (_, i) => i).find((i) => !set.has(i))
    const enter = (id: string, preferred: IdleAction) => {
      this.visits.delete(id)
      const seat = free(new Set([...this.visits.values()].flatMap((v) => v.seat === undefined ? [] : [v.seat])), 4)
      const coffee = free(used('coffee'), 2)
      const pool = free(used('billiards'), 2)
      const action = preferred === 'billiards' && pool !== undefined ? 'billiards' : coffee !== undefined && seat !== undefined ? 'coffee' : pool !== undefined ? 'billiards' : 'rest'
      const slot = action === 'coffee' ? coffee! : action === 'billiards' ? pool! : free(used('rest'), base.size + 1)!
      this.visits.set(id, { action, slot, token: `${id}:${++this.sequence}`, ...(action === 'coffee' ? { seat } : {}) })
    }
    // Sorting makes polling response order irrelevant; existing visits never get reassigned.
    for (const [id, placement] of [...base].sort(([a], [b]) => a.localeCompare(b))) {
      if (placement.intent !== 'idle') continue
      if (!this.visits.has(id)) enter(id, this.visits.size % 3 === 2 ? 'billiards' : 'coffee')
      const visit = this.visits.get(id)!
      if (arrivals.get(id) === visit.token && visit.arrivedAt === undefined) visit.arrivedAt = now
      const elapsed = visit.arrivedAt === undefined ? 0 : now - visit.arrivedAt
      if (visit.action === 'coffee' && elapsed >= 10000) this.visits.set(id, { action: 'lounge', slot: visit.seat!, seat: visit.seat, token: `${id}:${++this.sequence}` })
      else if (visit.action === 'lounge' && elapsed >= 44000) enter(id, 'billiards')
      else if (visit.action === 'billiards' && elapsed >= 26000) enter(id, 'coffee')
      else if (visit.action === 'rest' && elapsed >= 8000) enter(id, 'coffee')
    }
    const result = new Map(base)
    const seats = loungeSeats(this.layout)
    for (const [id, visit] of this.visits) {
      const x = this.layout.loungeX
      let placement: CompanyPlacement
      if (visit.action === 'coffee') placement = { position: [x + (visit.slot ? 5.8 : 1.3), 0, this.layout.bounds.minZ + 2.05], facing: Math.PI, seated: false, intent: 'idle', label: visit.arrivedAt === undefined ? 'Menuju pantry' : 'Membuat kopi' }
      else if (visit.action === 'lounge') {
        const seat = seats[visit.slot]
        const neighbor = [...this.visits.entries()].find(([other, v]) => other !== id && v.action === 'lounge' && v.arrivedAt !== undefined)
        placement = { ...seat, seated: true, intent: 'idle', label: visit.arrivedAt === undefined ? 'Membawa kopi ke ruang TV' : neighbor ? 'Ngobrol sambil menikmati kopi' : 'Menonton TV sambil menikmati kopi', idle: { ...visit, table: seat.table, ...(neighbor ? { peer: seats[neighbor[1].slot].position } : {}) } }
      } else if (visit.action === 'billiards') placement = { position: [x + (visit.slot ? 5.85 : 1.05), 0, 5.25], facing: visit.slot ? -Math.PI / 2 : Math.PI / 2, seated: false, intent: 'idle', label: visit.arrivedAt === undefined ? 'Menuju meja biliar' : 'Bermain biliar' }
      else placement = { ...deskPlacement(id, this.layout), intent: 'idle', label: 'Istirahat · menunggu tempat santai' }
      result.set(id, { ...placement, idle: placement.idle ?? { ...visit } })
    }
    return result
  }
}

/** Normal walking stays collision-safe; only the final sit/stand segment docks into a chair. */
export function activityWalkPath(from: Vec3, previousApproach: Vec3 | undefined, placement: CompanyPlacement, layout: CompanyLayout): Vec3[] {
  const target = placement.approach ?? placement.position
  const exit = !walkable(from[0], from[2], layout) ? previousApproach : undefined
  const start = exit ?? from
  const path = companyWalkPath([start[0], start[2]], [target[0], target[2]], layout).map(([x, z]): Vec3 => [x, 0, z])
  if (!path.length && Math.hypot(start[0] - target[0], start[2] - target[2]) > 0.1) return []
  return [...(exit ? [exit] : []), ...path, ...(placement.approach ? [placement.position] : [])]
}

const smooth = (t: number) => { const n = Math.max(0, Math.min(1, t)); return n * n * (3 - 2 * n) }
/** A single cup travels hand → table → mouth → table. 0=table, 1=mouth. */
export function sipMotion(elapsed: number, slot: number) {
  const t = ((elapsed - 6 - slot * 1.7) % 17 + 17) % 17
  const lift = elapsed < 6 + slot * 1.7 ? 0 : t < 1.4 ? smooth(t / 1.4) : t < 3 ? 1 : t < 4.4 ? 1 - smooth((t - 3) / 1.4) : 0
  return { lift, tilt: lift === 1 ? 0.38 : 0, placing: smooth((elapsed - 0.6) / 1.6) }
}

/** Both the player's cue and the balls use this shared shot clock. */
export function billiardShot(now: number, players: { slot: number; arrivedAt: number }[]) {
  const ready = players.filter((p) => now - p.arrivedAt > 1500).sort((a, b) => a.slot - b.slot)
  const turn = Math.floor(now / 7000)
  const phase = (now % 7000) / 1000
  return { slot: ready.length ? ready[turn % ready.length].slot : -1, phase, strike: phase >= 2.6 && phase < 2.9 }
}
