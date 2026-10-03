import { randomUUID } from 'node:crypto'

export interface OfficeInteraction { id: string; from: string; to: string; label: string; startedAt: string; expiresAt: string }
const events = new Map<string, OfficeInteraction>()
const PROFILE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/

/** Explicit actor/recipient evidence only. Generic 'delegating' logs cannot identify a room. */
export function interactionRecord(input: unknown, now = Date.now()): OfficeInteraction | undefined {
  if (!input || typeof input !== 'object') return
  const value = input as Record<string, unknown>
  if (typeof value.from !== 'string' || typeof value.to !== 'string' || !PROFILE.test(value.from) || !PROFILE.test(value.to) || value.from === value.to) return
  const started = typeof value.startedAt === 'string' ? Date.parse(value.startedAt) : now
  const duration = typeof value.durationSeconds === 'number' ? value.durationSeconds : 90
  if (!Number.isFinite(started) || started > now + 5_000 || started < now - 180_000 || !Number.isFinite(duration) || duration < 15 || duration > 180 || started + duration * 1000 <= now) return
  if (value.id !== undefined && (typeof value.id !== 'string' || value.id.length > 120 || !value.id.trim())) return
  if (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 160)) return
  return { id: typeof value.id === 'string' ? value.id : randomUUID(), from: value.from, to: value.to, label: typeof value.label === 'string' ? value.label : 'Delegasi tugas', startedAt: new Date(started).toISOString(), expiresAt: new Date(started + duration * 1000).toISOString() }
}

export function recordOfficeInteraction(event: OfficeInteraction, now = Date.now()) {
  activeOfficeInteractions(now)
  // Idempotency prevents retries from extending a visual visit forever.
  if (!events.has(event.id)) events.set(event.id, event)
  while (events.size > 100) events.delete(events.keys().next().value!)
  return events.get(event.id) ?? event
}

export function activeOfficeInteractions(now = Date.now()) {
  for (const [id, event] of events) if (Date.parse(event.expiresAt) <= now) events.delete(id)
  return [...events.values()]
}

export function clearOfficeInteractions() { events.clear() }

/** Optional integration marker in a profile's agent log, with a required stable timestamp. */
export function parseOfficeInteractions(output: string, profile: string, now = Date.now()): OfficeInteraction[] {
  const found: OfficeInteraction[] = []
  for (const line of output.split('\n')) {
    const marker = line.indexOf('MYCOMPANY_HANDOFF ')
    if (marker < 0) continue
    try {
      const value = JSON.parse(line.slice(marker + 'MYCOMPANY_HANDOFF '.length)) as Record<string, unknown>
      if (!value || typeof value !== 'object' || typeof value.startedAt !== 'string') continue
      const event = interactionRecord({ ...value, id: value.id ?? `${value.from}:${value.to}:${value.startedAt}` }, now)
      if (event && event.from === profile) found.push(event)
    } catch { /* Ignore malformed/unrelated log lines. */ }
  }
  return found
}
