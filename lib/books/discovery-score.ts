const DISCOVERY_PRIOR_SCORE = 4.2
const GOODREADS_COUNT_WEIGHT = 0.5

export function computeDiscoveryScore(params: {
  ratingScore: number | null | undefined
  amazonRatingCount: number | null | undefined
  goodreadsRatingCount: number | null | undefined
  minimumReviewConfidence?: number
  priorScore?: number
}): number {
  const effectiveReviewCount = getEffectiveReviewCount(params)
  const ratingScore = clampRatingScore(params.ratingScore ?? 0)
  const priorScore = clampRatingScore(params.priorScore ?? DISCOVERY_PRIOR_SCORE)
  const minimumReviewConfidence = Math.max(0, params.minimumReviewConfidence ?? 500)

  if (effectiveReviewCount <= 0) return 0
  if (minimumReviewConfidence === 0) return ratingScore

  const weightedRating = (effectiveReviewCount / (effectiveReviewCount + minimumReviewConfidence)) * ratingScore
  const weightedPrior = (minimumReviewConfidence / (effectiveReviewCount + minimumReviewConfidence)) * priorScore

  return clampRatingScore(weightedRating + weightedPrior)
}

export function getEffectiveReviewCount(params: {
  amazonRatingCount: number | null | undefined
  goodreadsRatingCount: number | null | undefined
}): number {
  const amazonRatingCount = Math.max(0, params.amazonRatingCount ?? 0)
  const goodreadsRatingCount = Math.max(0, params.goodreadsRatingCount ?? 0)

  return amazonRatingCount + goodreadsRatingCount * GOODREADS_COUNT_WEIGHT
}

function clampRatingScore(score: number): number {
  return Math.max(0, Math.min(5, score))
}
