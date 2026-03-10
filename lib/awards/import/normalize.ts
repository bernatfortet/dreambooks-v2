import type { AwardImportAmazonCandidate, AwardImportBookCandidate, NormalizedAwardEntry } from './types'

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeComparisonText(value: string): string {
  const normalizedValue = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()

  return collapseWhitespace(normalizedValue)
}

export function normalizeTitleForComparison(value: string): string {
  return normalizeComparisonText(value).replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizeNameForComparison(value: string): string {
  return normalizeComparisonText(value)
}

export function getPrimaryCreator(entry: NormalizedAwardEntry): string | undefined {
  return entry.author ?? entry.illustrator
}

export function createAwardEntryKey(entry: NormalizedAwardEntry): string {
  const creator = getPrimaryCreator(entry) ?? 'unknown'
  const normalizedTitle = normalizeTitleForComparison(entry.title).replace(/\s+/g, '-')
  const normalizedCreator = normalizeNameForComparison(creator).replace(/\s+/g, '-')
  return `${entry.awardName}-${entry.year}-${entry.resultType}-${normalizedTitle}-${normalizedCreator}`
}

export function scoreBookCandidate(params: {
  entry: NormalizedAwardEntry
  candidate: AwardImportBookCandidate
}): number {
  const { entry, candidate } = params
  const entryTitle = normalizeTitleForComparison(entry.title)
  const candidateTitle = normalizeTitleForComparison(candidate.title)

  let score = titleSimilarityScore(entryTitle, candidateTitle) * 0.8

  const primaryCreator = getPrimaryCreator(entry)
  if (!primaryCreator) return Number(score.toFixed(4))

  const creatorMatchScore = candidate.authors.length
    ? Math.max(...candidate.authors.map((author) => titleSimilarityScore(normalizeNameForComparison(primaryCreator), normalizeNameForComparison(author))))
    : 0

  score += creatorMatchScore * 0.2

  return Number(Math.min(score, 1).toFixed(4))
}

export function isStrongBookCandidateMatch(params: {
  entry: NormalizedAwardEntry
  candidate: AwardImportBookCandidate
}): boolean {
  const score = scoreBookCandidate(params)
  return score >= 0.92
}

export function scoreAmazonCandidate(params: {
  entry: NormalizedAwardEntry
  title: string
  byline?: string
}): number {
  const { entry, title, byline } = params
  let score = titleSimilarityScore(normalizeTitleForComparison(entry.title), normalizeTitleForComparison(title)) * 0.85

  const primaryCreator = getPrimaryCreator(entry)
  if (!primaryCreator || !byline) return Number(score.toFixed(4))

  const bylineScore = titleSimilarityScore(normalizeNameForComparison(primaryCreator), normalizeNameForComparison(byline))
  score += bylineScore * 0.15

  return Number(Math.min(score, 1).toFixed(4))
}

export function isSafeAmazonAutoSelection(params: {
  entry: NormalizedAwardEntry
  topCandidate: AwardImportAmazonCandidate & { score: number }
  secondCandidate?: AwardImportAmazonCandidate & { score: number }
}): boolean {
  const entryTitle = normalizeTitleForComparison(params.entry.title)
  const topTitle = normalizeTitleForComparison(params.topCandidate.title)

  if (entryTitle !== topTitle) {
    return false
  }

  const primaryCreator = getPrimaryCreator(params.entry)
  if (!primaryCreator || !params.topCandidate.byline) {
    return params.topCandidate.score >= 0.95
  }

  const creatorMatch = normalizeNameForComparison(params.topCandidate.byline).includes(normalizeNameForComparison(primaryCreator))
  if (!creatorMatch) {
    return false
  }

  if (!params.secondCandidate) {
    return true
  }

  const secondTitle = normalizeTitleForComparison(params.secondCandidate.title)
  const secondByline = normalizeNameForComparison(params.secondCandidate.byline ?? '')
  const sameWork =
    secondTitle === topTitle && secondByline === normalizeNameForComparison(params.topCandidate.byline ?? '')

  if (sameWork) {
    return true
  }

  return params.topCandidate.score - params.secondCandidate.score >= 0.05
}

function titleSimilarityScore(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.94

  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  const union = new Set([...leftTokens, ...rightTokens])

  if (union.size === 0) return 0

  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1
  }

  return overlap / union.size
}
