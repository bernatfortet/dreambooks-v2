import { internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'

const COVER_FORMAT_PRIORITY: Record<string, number> = {
  hardcover: 5,
  paperback: 4,
  board_book: 3,
  library_binding: 2,
  spiral: 1,
  kindle: 0,
  audiobook: -1,
  unknown: -2,
}

export const run = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    repaired: v.number(),
    skippedNoAlternative: v.number(),
    sample: v.array(
      v.object({
        bookId: v.id('books'),
        title: v.string(),
        fromFormat: v.string(),
        toFormat: v.string(),
      }),
    ),
  }),
  handler: async (context, args) => {
    const dryRun = args.dryRun ?? true
    const limit = args.limit ?? Number.POSITIVE_INFINITY

    console.log('🔄 Running preferred book cover backfill', { dryRun, limit })

    const books = await context.db.query('books').collect()
    const audiobookCoverBooks = books
      .filter((book) => book.cover?.sourceFormat === 'audiobook')
      .slice(0, Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : books.length)

    let repaired = 0
    let skippedNoAlternative = 0
    const sample: Array<{
      bookId: Id<'books'>
      title: string
      fromFormat: string
      toFormat: string
    }> = []

    for (const book of audiobookCoverBooks) {
      const editions = await context.db
        .query('bookEditions')
        .withIndex('by_bookId', (query) => query.eq('bookId', book._id))
        .collect()
      const candidates = await context.db
        .query('bookCoverCandidates')
        .withIndex('by_bookId', (query) => query.eq('bookId', book._id))
        .collect()

      const bestCandidate = pickBestReplacementCandidate({ editions, candidates })
      if (!bestCandidate) {
        skippedNoAlternative++
        continue
      }

      if (!dryRun) {
        await context.db.patch(book._id, {
          coverStatus: 'pending',
          cover: {
            ...(book.cover ?? {}),
            sourceUrl: bestCandidate.imageUrl,
            sourceFormat: bestCandidate.format,
            sourceAsin: bestCandidate.sourceAsin,
            ...(bestCandidate.width !== undefined && { width: bestCandidate.width }),
            ...(bestCandidate.height !== undefined && { height: bestCandidate.height }),
          },
        })

        await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
          bookId: book._id,
          sourceUrl: bestCandidate.imageUrl,
        })
      }

      repaired++

      if (sample.length < 20) {
        sample.push({
          bookId: book._id,
          title: book.title,
          fromFormat: book.cover?.sourceFormat ?? 'unknown',
          toFormat: bestCandidate.format,
        })
      }
    }

    console.log('✅ Preferred book cover backfill complete', {
      processed: audiobookCoverBooks.length,
      repaired,
      skippedNoAlternative,
    })

    return {
      processed: audiobookCoverBooks.length,
      repaired,
      skippedNoAlternative,
      sample,
    }
  },
})

function pickBestReplacementCandidate(params: {
  editions: Doc<'bookEditions'>[]
  candidates: Doc<'bookCoverCandidates'>[]
}) {
  const editionById = new Map(
    params.editions.map((edition) => [edition._id, edition] as const),
  )

  const eligibleCandidates = params.candidates
    .filter((candidate) => !candidate.badReason)
    .map((candidate) => {
      const edition = candidate.editionId ? editionById.get(candidate.editionId) : null
      if (!edition?.mainCoverUrl) return null

      const format = edition.format
      const priority = COVER_FORMAT_PRIORITY[format] ?? COVER_FORMAT_PRIORITY.unknown
      if (priority <= COVER_FORMAT_PRIORITY.audiobook) return null

      return {
        imageUrl: candidate.imageUrl,
        width: candidate.width,
        height: candidate.height,
        format,
        sourceAsin: edition.sourceId,
        priority,
        resolution: (candidate.width ?? 0) * (candidate.height ?? 0),
      }
    })
    .filter((candidate) => candidate !== null)

  eligibleCandidates.sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority
    return right.resolution - left.resolution
  })

  return eligibleCandidates[0] ?? null
}
