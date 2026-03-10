import { query, internalQuery } from '../_generated/server'
import { v } from 'convex/values'

// Shared validator for cover candidate documents
const coverCandidateValidator = v.object({
  _id: v.id('bookCoverCandidates'),
  _creationTime: v.number(),
  bookId: v.id('books'),
  editionId: v.optional(v.id('bookEditions')),
  imageUrl: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  source: v.string(),
  sourceUrl: v.optional(v.string()),
  isPrimary: v.optional(v.boolean()),
  badReason: v.optional(v.string()),
  createdAt: v.number(),
})

/**
 * List all cover candidates for a book.
 * Returns candidates sorted by isPrimary (primary first), then by resolution (largest first).
 */
export const listByBookId = query({
  args: {
    bookId: v.id('books'),
  },
  returns: v.array(coverCandidateValidator),
  handler: async (context, args) => {
    const candidates = await context.db
      .query('bookCoverCandidates')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    // Sort: primary first, then by resolution (width * height), then by createdAt
    return candidates.sort((a, b) => {
      // Primary candidates first
      if (a.isPrimary && !b.isPrimary) return -1
      if (!a.isPrimary && b.isPrimary) return 1

      // Non-bad candidates before bad ones
      if (!a.badReason && b.badReason) return -1
      if (a.badReason && !b.badReason) return 1

      // Higher resolution first
      const aRes = (a.width ?? 0) * (a.height ?? 0)
      const bRes = (b.width ?? 0) * (b.height ?? 0)
      if (aRes !== bRes) return bRes - aRes

      // Newer first
      return b.createdAt - a.createdAt
    })
  },
})

/**
 * List cover candidates for a book, grouped by source.
 */
export const listByBookIdGroupedBySource = query({
  args: {
    bookId: v.id('books'),
  },
  handler: async (context, args) => {
    const candidates = await context.db
      .query('bookCoverCandidates')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    // Group by source
    const grouped: Record<string, typeof candidates> = {}
    for (const candidate of candidates) {
      if (!grouped[candidate.source]) {
        grouped[candidate.source] = []
      }
      grouped[candidate.source].push(candidate)
    }

    // Sort within each group
    for (const source of Object.keys(grouped)) {
      grouped[source].sort((a, b) => {
        // Primary first
        if (a.isPrimary && !b.isPrimary) return -1
        if (!a.isPrimary && b.isPrimary) return 1

        // Non-bad before bad
        if (!a.badReason && b.badReason) return -1
        if (a.badReason && !b.badReason) return 1

        // Higher resolution first
        const aRes = (a.width ?? 0) * (a.height ?? 0)
        const bRes = (b.width ?? 0) * (b.height ?? 0)
        return bRes - aRes
      })
    }

    return grouped
  },
})

/**
 * Get count of cover candidates for a book.
 */
export const countByBookId = internalQuery({
  args: {
    bookId: v.id('books'),
  },
  returns: v.number(),
  handler: async (context, args) => {
    const candidates = await context.db
      .query('bookCoverCandidates')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    return candidates.length
  },
})
