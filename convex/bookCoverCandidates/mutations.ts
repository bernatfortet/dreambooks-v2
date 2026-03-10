import { internalMutation, mutation, type MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { v } from 'convex/values'

/**
 * Upsert a cover candidate.
 * Deduplicated by (bookId, imageUrl) - only one entry per unique cover URL per book.
 */
export const upsert = internalMutation({
  args: {
    bookId: v.id('books'),
    editionId: v.optional(v.id('bookEditions')),
    imageUrl: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    source: v.string(), // 'amazon' | 'goodreads' | etc.
    sourceUrl: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
  },
  returns: v.id('bookCoverCandidates'),
  handler: async (context, args) => {
    // Check for existing candidate by bookId + imageUrl
    const existing = await context.db
      .query('bookCoverCandidates')
      .withIndex('by_bookId_imageUrl', (q) => q.eq('bookId', args.bookId).eq('imageUrl', args.imageUrl))
      .unique()

    if (existing) {
      // Update existing candidate (dimensions/source might have been updated)
      await context.db.patch(existing._id, {
        editionId: args.editionId ?? existing.editionId,
        width: args.width ?? existing.width,
        height: args.height ?? existing.height,
        source: args.source,
        sourceUrl: args.sourceUrl ?? existing.sourceUrl,
        isPrimary: args.isPrimary ?? existing.isPrimary,
      })
      return existing._id
    }

    // Create new candidate
    const candidateId = await context.db.insert('bookCoverCandidates', {
      bookId: args.bookId,
      editionId: args.editionId,
      imageUrl: args.imageUrl,
      width: args.width,
      height: args.height,
      source: args.source,
      sourceUrl: args.sourceUrl,
      isPrimary: args.isPrimary,
      createdAt: Date.now(),
    })

    return candidateId
  },
})

/**
 * Select a cover candidate and trigger download.
 * Sets the book's coverSourceUrl and schedules downloadCover.
 */
export const selectCandidate = mutation({
  args: {
    candidateId: v.id('bookCoverCandidates'),
  },
  returns: v.object({
    bookId: v.id('books'),
    coverSourceUrl: v.string(),
  }),
  handler: async (context, args) => {
    const candidate = await context.db.get(args.candidateId)
    if (!candidate) {
      throw new Error('Cover candidate not found')
    }

    const book = await context.db.get(candidate.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    console.log('🎨 Selecting cover candidate', {
      bookId: candidate.bookId,
      imageUrl: candidate.imageUrl,
      source: candidate.source,
    })

    await applySelectedCover(context, {
      bookId: candidate.bookId,
      book,
      imageUrl: candidate.imageUrl,
      editionId: candidate.editionId,
      width: candidate.width,
      height: candidate.height,
    })

    return {
      bookId: candidate.bookId,
      coverSourceUrl: candidate.imageUrl,
    }
  },
})

/**
 * Mark a cover candidate as bad (for QA).
 */
export const markBad = mutation({
  args: {
    candidateId: v.id('bookCoverCandidates'),
    reason: v.string(), // 'too_small' | 'wrong_aspect' | 'blurry' | 'wrong_book' | etc.
  },
  returns: v.null(),
  handler: async (context, args) => {
    const candidate = await context.db.get(args.candidateId)
    if (!candidate) {
      throw new Error('Cover candidate not found')
    }

    await context.db.patch(args.candidateId, {
      badReason: args.reason,
    })

    console.log('🚫 Marked cover candidate as bad', {
      candidateId: args.candidateId,
      reason: args.reason,
    })

    return null
  },
})

/**
 * Select a cover from a URL (creates candidate if needed, then triggers download).
 * Useful for selecting covers from editions that may not have a candidate entry yet.
 */
export const selectCoverFromUrl = mutation({
  args: {
    bookId: v.id('books'),
    imageUrl: v.string(),
    source: v.optional(v.string()),
    editionId: v.optional(v.id('bookEditions')),
  },
  returns: v.object({
    bookId: v.id('books'),
    coverSourceUrl: v.string(),
    candidateId: v.id('bookCoverCandidates'),
  }),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    // Check for existing candidate by bookId + imageUrl
    let candidate = await context.db
      .query('bookCoverCandidates')
      .withIndex('by_bookId_imageUrl', (q) => q.eq('bookId', args.bookId).eq('imageUrl', args.imageUrl))
      .unique()

    // Create candidate if it doesn't exist
    if (!candidate) {
      const candidateId = await context.db.insert('bookCoverCandidates', {
        bookId: args.bookId,
        editionId: args.editionId,
        imageUrl: args.imageUrl,
        source: args.source ?? 'manual',
        isPrimary: false,
        createdAt: Date.now(),
      })
      candidate = await context.db.get(candidateId)
    }

    if (!candidate) {
      throw new Error('Failed to create cover candidate')
    }

    console.log('🎨 Selecting cover from URL', {
      bookId: args.bookId,
      imageUrl: args.imageUrl,
      source: args.source,
    })

    await applySelectedCover(context, {
      bookId: args.bookId,
      book,
      imageUrl: args.imageUrl,
      editionId: args.editionId ?? candidate.editionId,
      width: candidate.width,
      height: candidate.height,
    })

    return {
      bookId: args.bookId,
      coverSourceUrl: args.imageUrl,
      candidateId: candidate._id,
    }
  },
})

/**
 * Delete all cover candidates for a book (used when deleting a book).
 */
export const deleteByBookId = internalMutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.number(),
  handler: async (context, args) => {
    const candidates = await context.db
      .query('bookCoverCandidates')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const candidate of candidates) {
      await context.db.delete(candidate._id)
    }

    return candidates.length
  },
})

async function getCoverSourceMetadata(
  context: MutationCtx,
  editionId: Id<'bookEditions'> | undefined,
): Promise<{ sourceAsin?: string; sourceFormat?: string }> {
  if (!editionId) return {}

  const edition = await context.db.get(editionId)
  if (!edition) return {}

  return {
    sourceAsin: edition.sourceId,
    sourceFormat: edition.format,
  }
}

async function applySelectedCover(
  context: MutationCtx,
  params: {
    bookId: Id<'books'>
    book: Doc<'books'>
    imageUrl: string
    editionId: Id<'bookEditions'> | undefined
    width: number | undefined
    height: number | undefined
  },
): Promise<void> {
  const coverSourceMetadata = await getCoverSourceMetadata(context, params.editionId)
  const cover = buildSelectedCover({
    existingCover: params.book.cover,
    imageUrl: params.imageUrl,
    width: params.width,
    height: params.height,
    coverSourceMetadata,
  })

  await context.db.patch(params.bookId, {
    coverStatus: 'pending',
    cover,
  })

  await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
    bookId: params.bookId,
    sourceUrl: params.imageUrl,
  })
}

function buildSelectedCover(params: {
  existingCover: Record<string, unknown> | undefined
  imageUrl: string
  width: number | undefined
  height: number | undefined
  coverSourceMetadata: { sourceAsin?: string; sourceFormat?: string }
}) {
  const existingCover = params.existingCover ?? {}

  return {
    ...existingCover,
    sourceUrl: params.imageUrl,
    ...(params.coverSourceMetadata.sourceAsin !== undefined && {
      sourceAsin: params.coverSourceMetadata.sourceAsin,
    }),
    ...(params.coverSourceMetadata.sourceFormat !== undefined && {
      sourceFormat: params.coverSourceMetadata.sourceFormat,
    }),
    width: params.width,
    height: params.height,
  }
}
