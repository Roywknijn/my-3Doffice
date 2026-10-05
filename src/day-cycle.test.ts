import { describe, expect, it } from 'vitest'
import { currentHour, dayCycle } from './day-cycle.ts'

describe('day cycle', () => {
  it('is bright at noon, dim but readable at midnight, and warm at dusk', () => {
    expect(dayCycle(12)).toMatchObject({ daylight: 1, warmth: 0, light: 1 })
    expect(dayCycle(0).daylight).toBe(0)
    expect(dayCycle(0).light).toBeCloseTo(0.6)
    expect(dayCycle(18.5).warmth).toBeCloseTo(1)
    expect(dayCycle(6.5).warmth).toBeCloseTo(1)
  })

  it('changes smoothly across sunrise and sunset', () => {
    let previous = dayCycle(5).daylight
    for (let hour = 5.1; hour <= 8; hour += 0.1) {
      const next = dayCycle(hour).daylight
      expect(next).toBeGreaterThanOrEqual(previous)
      expect(next - previous).toBeLessThan(0.25)
      previous = next
    }
  })

  it('reads the hour from the clock, or from a valid ?hour override', () => {
    expect(currentHour(new Date(2026, 0, 1, 9, 30), '')).toBe(9.5)
    expect(currentHour(new Date(2026, 0, 1, 9, 30), '?hour=19')).toBe(19)
    expect(currentHour(new Date(2026, 0, 1, 9, 30), '?hour=99')).toBe(9.5)
    expect(currentHour(new Date(2026, 0, 1, 9, 30), '?hour=abc')).toBe(9.5)
  })
})
