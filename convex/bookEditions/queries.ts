import { query, internalQuery } from '../_generated/server'
import { v } from 'convex/values'

/**
 * List all editions for a book.
 */
export const listByBookId = query({
  args: {
    bookId: v.id('books'),
  },
  returns: v.array(
    v.object({
      _id: v.id('bookEditions'),
      _creationTime: v.float64(),
      bookId: v.id('books'),
      source: v.string(),
      sourceId: v.string(),
      sourceUrl: v.string(),
      format: v.string(),
      isbn10: v.optional(v.string()),
      isbn13: v.optional(v.string()),
      mainCoverUrl: v.optional(v.string()),
      publisherId: v.optional(v.id('publishers')),
      createdAt: v.float64(),
      updatedAt: v.optional(v.float64()),
    }),
  ),
  handler: async (context, args) => {
    return await context.db
      .query('bookEditions')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()
  },
})

/**
 * Find edition by source and sourceId (e.g., Amazon ASIN).
 */
export const findBySourceId = internalQuery({
  args: {
    source: v.string(),
    sourceId: v.string(),
  },
  handler: async (context, args) => {
    return await context.db
      .query('bookEditions')
      .withIndex('by_source_sourceId', (q) => q.eq('source', args.source).eq('sourceId', args.sourceId))
      .unique()
  },
})

/**
 * Find edition by ISBN-13.
 */
export const findByIsbn13 = internalQuery({
  args: {
    isbn13: v.string(),
  },
  handler: async (context, args) => {
    return await context.db
      .query('bookEditions')
      .withIndex('by_isbn13', (q) => q.eq('isbn13', args.isbn13))
      .first()
  },
})
