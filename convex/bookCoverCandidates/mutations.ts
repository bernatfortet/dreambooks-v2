import { internalMutation, mutation } from '../_generated/server'
import { internal } from '../_generated/api'
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

    // Build nested cover object, preserving existing storage IDs
    const existingCover = book.cover ?? {}
    const cover = {
      ...existingCover,
      sourceUrl: candidate.imageUrl,
      sourceAsin: candidate.editionId ? undefined : existingCover.sourceAsin,
      width: candidate.width,
      height: candidate.height,
    }

    await context.db.patch(candidate.bookId, {
      coverStatus: 'pending',
      cover,
    })

    // Schedule cover download
    await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
      bookId: candidate.bookId,
      sourceUrl: candidate.imageUrl,
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

    // Build nested cover object, preserving existing storage IDs
    const existingCover = book.cover ?? {}
    const cover = {
      ...existingCover,
      sourceUrl: args.imageUrl,
      width: candidate.width,
      height: candidate.height,
    }

    await context.db.patch(args.bookId, {
      coverStatus: 'pending',
      cover,
    })

    // Schedule cover download
    await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
      bookId: args.bookId,
      sourceUrl: args.imageUrl,
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
