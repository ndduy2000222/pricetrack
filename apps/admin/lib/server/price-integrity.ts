export function numberOrNull (value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function comparablePrice (value: unknown, available: unknown = true) {
  const price = numberOrNull(value)
  return available === true && price !== null && price > 0 ? price : null
}

export function validPriceBounds (floorPrice: unknown, ceilingPrice: unknown) {
  const floor = numberOrNull(floorPrice)
  const ceiling = numberOrNull(ceilingPrice)
  return floor !== null && ceiling !== null && floor >= 0 && ceiling >= 0 && floor <= ceiling
}

export function isPastOrPresentObservation (observedAt: unknown, now = Date.now()) {
  const timestamp = typeof observedAt === 'number' ? observedAt : typeof observedAt === 'string' ? Date.parse(observedAt) : NaN
  return Number.isFinite(timestamp) && Number.isFinite(now) && timestamp <= now
}
