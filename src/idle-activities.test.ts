import { describe, expect, it } from 'vitest'
import { activityWalkPath, billiardShot, IdleDirector, loungeSeats, sipMotion } from './idle-activities.ts'
import { companyLayout, deskPlacement, walkable, type CompanyPlacement } from './company-layout.ts'

const ids = ['default', 'coder', 'writer', 'researcher', 'project-manager', 'staff-6', 'staff-7', 'staff-8', 'staff-9']
const layout = companyLayout(ids.map((id) => ({ id })))
const base = (crew = ids) => new Map(crew.map((id): [string, CompanyPlacement] => [id, { ...deskPlacement(id, layout), intent: 'idle', label: 'Idle' }]))
const arrived = (p: Map<string, CompanyPlacement>) => new Map([...p].map(([id, plan]) => [id, plan.idle!.token]))

describe('idle choreography', () => {
  it('reserves unique seats, coffee makers and pool positions even with an overflowing roster', () => {
    const director = new IdleDirector(layout)
    let plans = director.update(base(), new Map(), 0)
    for (let now = 0; now < 150000; now += 1000) {
      plans = director.update(base(), arrived(plans), now)
      const occupied = [...plans.values()].map((p) => p.position.join(','))
      expect(new Set(occupied).size).toBe(ids.length)
      for (const action of ['coffee', 'billiards', 'lounge']) {
        const items = [...plans.values()].filter((p) => p.idle?.action === action)
        expect(new Set(items.map((p) => p.idle?.slot)).size).toBe(items.length)
      }
    }
  })
  it('waits for arrival, brews first, then carries to a chair; polling does not restart the visit', () => {
    const director = new IdleDirector(layout)
    const one = base(['default'])
    const first = director.update(one, new Map(), 0)
    expect(first.get('default')?.idle?.action).toBe('coffee')
    expect(director.update(one, new Map(), 90000).get('default')?.idle).toEqual(first.get('default')?.idle)
    const brewing = director.update(one, arrived(first), 90000)
    expect(director.update(one, arrived(brewing), 99999).get('default')?.idle?.action).toBe('coffee')
    const lounge = director.update(one, arrived(brewing), 100000)
    expect(lounge.get('default')).toMatchObject({ seated: true, label: 'Membawa kopi ke ruang TV', idle: { action: 'lounge' } })
    expect(lounge.get('default')?.idle?.arrivedAt).toBeUndefined()
    expect(director.update(one, arrived(lounge), 110000).get('default')?.label).toContain('Menonton TV')
  })
  it('converses only with agents that have actually arrived in the TV area', () => {
    const director = new IdleDirector(layout)
    const two = base(['coder', 'default'])
    const initial = director.update(two, new Map(), 0)
    director.update(two, arrived(initial), 0)
    const lounge = director.update(two, arrived(initial), 10000)
    const oneArrival = new Map([['coder', lounge.get('coder')!.idle!.token]])
    const alone = director.update(two, oneArrival, 11000)
    expect(alone.get('coder')?.idle?.peer).toBeUndefined()
    const together = director.update(two, arrived(lounge), 12000)
    expect(together.get('coder')?.idle?.peer).toEqual(together.get('default')?.position)
  })
  it.each(['desk', 'meeting', 'handoff'] as const)('immediately releases props and reservations for %s', (intent) => {
    const director = new IdleDirector(layout)
    const one = base(['default'])
    const before = director.update(one, new Map(), 0)
    const interrupted = new Map([['default', { ...one.get('default')!, intent }]])
    expect(director.update(interrupted, arrived(before), 1000).get('default')?.idle).toBeUndefined()
    expect(director.update(one, arrived(before), 2000).get('default')?.idle?.token).not.toBe(before.get('default')?.idle?.token)
    expect(director.update(new Map(), new Map(), 3000).size).toBe(0)
  })
  it('routes to both coffee makers, pool spots and all chair approaches, then exits chairs', () => {
    const director = new IdleDirector(layout)
    const plans = director.update(base(), new Map(), 0)
    for (const [id, p] of plans) {
      const start = deskPlacement(id, layout).position
      if (p.idle?.action === 'rest') continue
      expect(walkable(p.position[0], p.position[2], layout), p.label).toBe(true)
      expect(activityWalkPath(start, undefined, p, layout).at(-1)).toEqual(p.position)
    }
    for (const seat of loungeSeats(layout)) {
      expect(walkable(seat.approach[0], seat.approach[2], layout)).toBe(true)
      const p: CompanyPlacement = { ...seat, seated: true, intent: 'idle', label: 'TV' }
      expect(activityWalkPath([layout.loungeX + 1.3, 0, layout.bounds.minZ + 2.05], undefined, p, layout).at(-1)).toEqual(seat.position)
      const desk: CompanyPlacement = { ...deskPlacement('default', layout), intent: 'desk', label: 'Work' }
      const out = activityWalkPath(seat.position, seat.approach, desk, layout)
      expect(out[0]).toEqual(seat.approach)
      expect(out.at(-1)).toEqual(desk.position)
    }
  })
  it('sets the cup down, lifts it to drink, and returns it to the table', () => {
    expect(sipMotion(0, 0).placing).toBe(0)
    expect(sipMotion(3, 0)).toMatchObject({ placing: 1, lift: 0 })
    expect(sipMotion(8, 0)).toMatchObject({ lift: 1, tilt: 0.38 })
    expect(sipMotion(12, 0)).toMatchObject({ lift: 0, tilt: 0 })
    expect(sipMotion(25, 0).lift).toBe(1)
  })
  it('alternates shots and keeps the pool idle when no player is present', () => {
    expect(billiardShot(2800, []).slot).toBe(-1)
    expect(billiardShot(2800, [{ slot: 0, arrivedAt: 0 }, { slot: 1, arrivedAt: 0 }])).toMatchObject({ slot: 0, strike: true })
    expect(billiardShot(9800, [{ slot: 0, arrivedAt: 0 }, { slot: 1, arrivedAt: 0 }])).toMatchObject({ slot: 1, strike: true })
  })
})
