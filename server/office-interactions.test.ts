import { beforeEach, describe, expect, it } from 'vitest'
import { activeOfficeInteractions, clearOfficeInteractions, interactionRecord, parseOfficeInteractions, recordOfficeInteraction } from './office-interactions.js'

const now = Date.parse('2026-10-03T10:00:00Z')
beforeEach(clearOfficeInteractions)
describe('office handoff evidence', () => {
  it('validates actor, recipient, TTL and timestamp', () => {
    expect(interactionRecord({ from: 'manager', to: 'coder' }, now)).toMatchObject({ from: 'manager', to: 'coder', expiresAt: new Date(now + 90000).toISOString() })
    for (const input of [null, {}, { from: 'a', to: 'a' }, { from: '../root', to: 'coder' }, { from: 'a', to: 'b', durationSeconds: 900 }, { from: 'a', to: 'b', startedAt: 'invalid' }]) expect(interactionRecord(input, now)).toBeUndefined()
  })
  it('expires events, deduplicates retries, and bounds memory', () => {
    const event = interactionRecord({ id: 'one', from: 'manager', to: 'coder' }, now)!
    recordOfficeInteraction(event, now)
    recordOfficeInteraction({ ...event, expiresAt: new Date(now + 180000).toISOString() }, now)
    expect(activeOfficeInteractions(now)).toHaveLength(1)
    expect(activeOfficeInteractions(now + 90001)).toHaveLength(0)
    for (let i = 0; i < 110; i++) recordOfficeInteraction({ ...event, id: `e${i}` }, now)
    expect(activeOfficeInteractions(now)).toHaveLength(100)
  })
  it('only recognizes explicit timestamped markers from the sender profile', () => {
    const payload = { from: 'manager', to: 'coder', startedAt: new Date(now).toISOString() }
    const log = `2026-10-03 10:00:00 INFO tools.delegate: MYCOMPANY_HANDOFF ${JSON.stringify(payload)}`
    expect(parseOfficeInteractions(log, 'manager', now)).toHaveLength(1)
    expect(parseOfficeInteractions(log, 'coder', now)).toEqual([])
    expect(parseOfficeInteractions(log, 'manager', now + 91000)).toEqual([])
    expect(parseOfficeInteractions('Delegating a task to coder\nMYCOMPANY_HANDOFF null\nMYCOMPANY_HANDOFF {}', 'manager', now)).toEqual([])
  })
})
