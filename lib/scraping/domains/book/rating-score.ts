// Compute a single weighted rating score from Amazon and Goodreads ratings.
// Uses log-weighted blending to prevent sources with huge counts from dominating.
export function computeRatingScore(ratings: {
  amazonAverage: number | null
  amazonCount: number | null
  goodreadsAverage: number | null
  goodreadsCount: number | null
}): number {
  const sources: { avg: number; weight: number }[] = []

  if (ratings.amazonAverage != null && ratings.amazonCount != null && ratings.amazonCount > 0) {
    const clampedAvg = Math.max(0, Math.min(5, ratings.amazonAverage))
    sources.push({ avg: clampedAvg, weight: Math.log10(ratings.amazonCount + 1) })
  }

  if (ratings.goodreadsAverage != null && ratings.goodreadsCount != null && ratings.goodreadsCount > 0) {
    const clampedAvg = Math.max(0, Math.min(5, ratings.goodreadsAverage))
    sources.push({ avg: clampedAvg, weight: Math.log10(ratings.goodreadsCount + 1) })
  }

  if (sources.length === 0) return 0

  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0)
  const weightedSum = sources.reduce((sum, s) => sum + s.avg * s.weight, 0)

  const score = weightedSum / totalWeight
  return Math.max(0, Math.min(5, score))
}
