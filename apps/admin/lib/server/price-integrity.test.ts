import { describe, expect, it } from 'vitest'
import { comparablePrice, isPastOrPresentObservation, numberOrNull, validPriceBounds } from './price-integrity'

describe('price integrity', () => {
  it('keeps missing numeric values as null', () => {
    expect(numberOrNull(null)).toBeNull()
    expect(numberOrNull('')).toBeNull()
    expect(numberOrNull(undefined)).toBeNull()
  })

  it('accepts real numeric values without coercing invalid values to zero', () => {
    expect(numberOrNull('125000')).toBe(125000)
    expect(numberOrNull('not-a-price')).toBeNull()
    expect(comparablePrice(null)).toBeNull()
    expect(comparablePrice(0)).toBeNull()
    expect(comparablePrice(99000)).toBe(99000)
  })

  it('rejects invalid pricing bounds and non-finite values', () => {
    expect(comparablePrice(-1)).toBeNull()
    expect(comparablePrice(0)).toBeNull()
    expect(comparablePrice(Number.NaN)).toBeNull()
    expect(comparablePrice(Number.POSITIVE_INFINITY)).toBeNull()
    expect(comparablePrice(99000, false)).toBeNull()
  })

  it('rejects non-numeric values and invalid floor-ceiling bounds', () => {
    expect(numberOrNull(Number.NaN)).toBeNull()
    expect(numberOrNull(true)).toBeNull()
    expect(validPriceBounds(80_000, 120_000)).toBe(true)
    expect(validPriceBounds(Number.NaN, 120_000)).toBe(false)
    expect(validPriceBounds(120_001, 120_000)).toBe(false)
  })

  it('rejects future observations', () => {
    const now = Date.parse('2026-11-27T10:00:00.000Z')
    expect(isPastOrPresentObservation('2026-11-27T10:00:00.000Z', now)).toBe(true)
    expect(isPastOrPresentObservation('2026-11-27T10:00:00.001Z', now)).toBe(false)
  })
})
