// Visual-only time of day for the 3D office. `light` never drops below 0.6 so agents stay readable at night.

export interface DayCycle { daylight: number; warmth: number; light: number }

const smooth = (edge0: number, edge1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t) }

/** `hour` is the local hour of day, 0 <= hour < 24 (fractions allowed). */
export function dayCycle(hour: number, sunrise = 6.5, sunset = 18.5): DayCycle {
  const daylight = smooth(sunrise - 0.75, sunrise + 0.75, hour) * (1 - smooth(sunset - 0.75, sunset + 0.75, hour))
  const warmth = Math.max(0, 1 - Math.abs(hour - sunrise) / 1.25, 1 - Math.abs(hour - sunset) / 1.5)
  return { daylight, warmth, light: 0.6 + 0.4 * daylight }
}

/** Local hour; `?hour=19` in the page URL previews another time of day. */
export function currentHour(now = new Date(), search = typeof window === 'undefined' ? '' : window.location.search): number {
  const forced = Number(new URLSearchParams(search).get('hour'))
  if (new URLSearchParams(search).has('hour') && Number.isFinite(forced) && forced >= 0 && forced < 24) return forced
  return now.getHours() + now.getMinutes() / 60
}
