import type { NormalizedAwardEntry } from '@/lib/awards/import/types'
import {
  fetchScoredAmazonBookCandidates,
  fetchScoredExistingBookCandidates,
  getUnresolvedMatchReason,
  shouldAutoSelectAmazonBook,
  shouldAutoSelectExistingBook,
  type ScoredAmazonBookCandidate,
  type ScoredExistingBookCandidate,
} from '@/lib/awards/import/research'
import {
  claimNextBookIntake,
  getConvexClient,
  markBookIntakeFailed,
  markBookIntakeNeedsReview,
  markBookIntakeReadyToScrape,
  markBookIntakeResolvedExisting,
  type BookIntakeItem,
} from '../convex'
import { finishItemLog, getWorkerId, log, logError, startItemLog } from '../utils'

type FlowResult = {
  workDone: boolean
}

export async function processBookIntakeFlow(params: { dryRun: boolean }): Promise<FlowResult> {
  if (params.dryRun) {
    console.log('📥 Skipping book intake processing in dry run mode')
    return { workDone: false }
  }

  const intakeItem = await claimNextBookIntake(getWorkerId())
  if (!intakeItem) {
    console.log('📥 No book intake items')
    return { workDone: false }
  }

  startItemLog()

  let success = false
  try {
    success = await processClaimedBookIntake(intakeItem)
  } catch (error) {
    logError('   🚨 Book intake crashed', error)
    const message = error instanceof Error ? error.message : 'Unknown intake processing error'
    await markBookIntakeFailed(intakeItem._id, message)
  } finally {
    finishItemLog('book-intake', intakeItem.searchQuery, success, intakeItem.sourcePath ?? undefined, intakeItem.sourceLabel ?? undefined)
  }

  return { workDone: true }
}

async function processClaimedBookIntake(intakeItem: BookIntakeItem) {
  log('─'.repeat(60))
  log(`📥 Processing book intake: ${intakeItem.title}`)
  log('─'.repeat(60))

  const client = getConvexClient()
  const entry = toSyntheticAwardEntry(intakeItem)
  const existingCandidates = await fetchScoredExistingBookCandidates({ client, entry, limit: 5 })
  const strongestExistingCandidate = existingCandidates[0]

  if (shouldAutoSelectExistingBook({ entry, candidates: existingCandidates }) && strongestExistingCandidate) {
    log(`   ✅ Linked existing book: ${strongestExistingCandidate.title}`)
    await markBookIntakeResolvedExisting({
      intakeId: intakeItem._id,
      bookId: strongestExistingCandidate.bookId,
    })
    return true
  }

  let amazonCandidates: ScoredAmazonBookCandidate[] = []
  try {
    amazonCandidates = await fetchScoredAmazonBookCandidates({
      entry,
      headless: true,
      limit: 5,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Amazon search failed'
    log(`   ⚠️ ${reason}`)
    await markBookIntakeNeedsReview({
      intakeId: intakeItem._id,
      reason,
      candidateSnapshotJson: buildCandidateSnapshot({ existingCandidates, amazonCandidates: [] }),
    })
    return true
  }

  const strongestAmazonCandidate = amazonCandidates[0]

  if (shouldAutoSelectAmazonBook({ entry, candidates: amazonCandidates }) && strongestAmazonCandidate) {
    log(`   ✅ Queued scrape for ${strongestAmazonCandidate.title}`)
    await markBookIntakeReadyToScrape({
      intakeId: intakeItem._id,
      amazonUrl: strongestAmazonCandidate.amazonUrl,
    })
    return true
  }

  const reviewReason = getUnresolvedMatchReason({
    existingCandidateCount: existingCandidates.length,
    amazonCandidateCount: amazonCandidates.length,
  })
  log(`   ⚠️ Needs review: ${reviewReason}`)
  await markBookIntakeNeedsReview({
    intakeId: intakeItem._id,
    reason: reviewReason,
    candidateSnapshotJson: buildCandidateSnapshot({ existingCandidates, amazonCandidates }),
    matchedAsin: strongestAmazonCandidate?.asin,
    matchedAmazonUrl: strongestAmazonCandidate?.amazonUrl,
  })
  return true
}

function buildCandidateSnapshot(params: {
  existingCandidates: ScoredExistingBookCandidate[]
  amazonCandidates: ScoredAmazonBookCandidate[]
}) {
  return JSON.stringify({
    existingCandidates: params.existingCandidates.map((candidate) => ({
      bookId: candidate.bookId,
      title: candidate.title,
      authors: candidate.authors,
      slug: candidate.slug,
      amazonUrl: candidate.amazonUrl,
      score: candidate.score,
    })),
    amazonCandidates: params.amazonCandidates.map((candidate) => ({
      asin: candidate.asin,
      amazonUrl: candidate.amazonUrl,
      title: candidate.title,
      byline: candidate.byline,
      score: candidate.score,
      rank: candidate.rank,
    })),
  })
}

function toSyntheticAwardEntry(intakeItem: BookIntakeItem): NormalizedAwardEntry {
  return {
    awardName: intakeItem.linkedAwardName ?? intakeItem.sourceLabel ?? 'book intake',
    year: intakeItem.linkedAwardYear ?? 0,
    resultType: intakeItem.linkedAwardResultType ?? 'other',
    categoryLabel: intakeItem.linkedAwardCategory ?? intakeItem.sourceType,
    title: intakeItem.title,
    author: intakeItem.authorName ?? undefined,
    illustrator: intakeItem.illustratorName ?? undefined,
    sourceName: intakeItem.sourceLabel ?? intakeItem.sourceType,
    sourcePath: intakeItem.sourcePath ?? intakeItem.searchQuery,
    sourcePage: intakeItem.sourcePage ?? undefined,
    rawText: intakeItem.rawText ?? intakeItem.searchQuery,
  }
}
