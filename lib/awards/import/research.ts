import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { searchAmazonBookCandidates } from '@/scripts/awards/lib/amazon-search'
import type { AwardImportAmazonCandidate, AwardImportBookCandidate, NormalizedAwardEntry } from './types'
import {
  getPrimaryCreator,
  isSafeAmazonAutoSelection,
  isStrongBookCandidateMatch,
  scoreAmazonCandidate,
  scoreBookCandidate,
} from './normalize'

const DECISIVE_SCORE_GAP = 0.08
const AMAZON_HIGH_CONFIDENCE_SCORE = 0.92

export type ScoredExistingBookCandidate = AwardImportBookCandidate & {
  score: number
}

export type ScoredAmazonBookCandidate = AwardImportAmazonCandidate & {
  score: number
}

export async function fetchScoredExistingBookCandidates(params: {
  client: ConvexHttpClient
  entry: NormalizedAwardEntry
  limit: number
}): Promise<ScoredExistingBookCandidate[]> {
  const rawCandidates = await params.client.query(api.awards.queries.findBookCandidatesForImport, {
    title: params.entry.title,
    author: getPrimaryCreator(params.entry),
    limit: params.limit,
  })

  return rawCandidates
    .map((candidate) => ({
      ...candidate,
      score: scoreBookCandidate({
        entry: params.entry,
        candidate,
      }),
    }))
    .sort((left, right) => right.score - left.score)
}

export async function fetchScoredAmazonBookCandidates(params: {
  entry: NormalizedAwardEntry
  headless: boolean
  limit: number
}): Promise<ScoredAmazonBookCandidate[]> {
  const rawCandidates = await searchAmazonBookCandidates({
    entry: params.entry,
    headless: params.headless,
    limit: params.limit,
  })

  return rawCandidates
    .map((candidate) => ({
      ...candidate,
      score: scoreAmazonCandidate({
        entry: params.entry,
        title: candidate.title,
        byline: candidate.byline,
      }),
    }))
    .sort((left, right) => right.score - left.score)
}

export function shouldAutoSelectExistingBook(params: {
  entry: NormalizedAwardEntry
  candidates: ScoredExistingBookCandidate[]
}) {
  const [topCandidate, secondCandidate] = params.candidates
  if (!topCandidate) return false

  return (
    isStrongBookCandidateMatch({
      entry: params.entry,
      candidate: topCandidate,
    }) && hasDistinctLead(topCandidate.score, secondCandidate?.score)
  )
}

export function shouldAutoSelectAmazonBook(params: {
  entry: NormalizedAwardEntry
  candidates: ScoredAmazonBookCandidate[]
}) {
  const [topCandidate, secondCandidate] = params.candidates
  if (!topCandidate) return false

  return (
    isSafeAmazonAutoSelection({
      entry: params.entry,
      topCandidate,
      secondCandidate,
    }) || (topCandidate.score >= AMAZON_HIGH_CONFIDENCE_SCORE && hasDistinctLead(topCandidate.score, secondCandidate?.score))
  )
}

export function getUnresolvedMatchReason(params: {
  existingCandidateCount: number
  amazonCandidateCount: number
}) {
  if (params.existingCandidateCount > 0 || params.amazonCandidateCount > 0) {
    return 'Top candidates were not distinct enough to auto-select safely.'
  }

  return 'No strong Dreambooks or Amazon candidate was found.'
}

function hasDistinctLead(topScore: number, secondScore?: number) {
  return topScore - (secondScore ?? 0) >= DECISIVE_SCORE_GAP
}
