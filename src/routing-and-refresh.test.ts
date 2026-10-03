import { describe, expect, it } from 'vitest'
import { orderedStatuses } from './format.ts'
import { mergeRefresh } from './request-state.ts'
import { navigation, pageFromLocation, pagePath } from './routes.ts'

describe('path routing', () => {
  it('round-trips every page through a clean path and falls back to the Office home', () => {
    for (const page of navigation) expect(pageFromLocation(pagePath(page))).toBe(page)
    expect(pagePath('Office')).toBe('/')
    expect(pagePath('Settings')).toBe('/settings')
    expect(pageFromLocation('/task-board')).toBe('Task Board')
    expect(pageFromLocation('/folders/coder')).toBe('Folders')
    expect(pageFromLocation('/office')).toBe('Office')
    expect(pageFromLocation('/nope')).toBe('Office')
  })
})

describe('background refresh', () => {
  it('keeps the last good data (marked stale) when a refresh fails', () => {
    expect(mergeRefresh({ status: 'ready', data: 1 }, { status: 'failed' })).toEqual({ status: 'ready', data: 1, stale: true })
    expect(mergeRefresh<number>({ status: 'pending' }, { status: 'failed' })).toEqual({ status: 'failed' })
    expect(mergeRefresh({ status: 'ready', data: 1, stale: true }, { status: 'ready', data: 2 })).toEqual({ status: 'ready', data: 2 })
  })
})

describe('kanban column order', () => {
  it('follows the Hermes board order and appends unknown statuses', () => {
    expect(orderedStatuses(['done', 'custom', 'running', 'triage'])).toEqual(['triage', 'running', 'done', 'custom'])
    expect(orderedStatuses(['blocked'], true)).toEqual(['todo', 'ready', 'running', 'blocked', 'review', 'done'])
  })
})
