import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Upsert a book edition (one row per format/source).
 * Deduplicated by (source, sourceId).
 */
export const upsert = internalMutation({
  args: {
    bookId: v.id('books'),
    source: v.string(), // 'amazon' | 'goodreads' | 'bookshop' | etc.
    sourceId: v.string(), // Amazon ASIN, provider-specific ID
    sourceUrl: v.string(),
    format: v.string(), // 'hardcover' | 'paperback' | 'kindle' | 'audiobook' | etc.
    isbn10: v.optional(v.string()),
    isbn13: v.optional(v.string()),
    mainCoverUrl: v.optional(v.string()),
    publisherId: v.optional(v.id('publishers')),
  },
  returns: v.id('bookEditions'),
  handler: async (context, args) => {
    // Check for existing edition by source + sourceId
    const existing = await context.db
      .query('bookEditions')
      .withIndex('by_source_sourceId', (q) => q.eq('source', args.source).eq('sourceId', args.sourceId))
      .unique()

    if (existing) {
      // Update existing edition
      await context.db.patch(existing._id, {
        bookId: args.bookId,
        sourceUrl: args.sourceUrl,
        format: args.format,
        isbn10: args.isbn10,
        isbn13: args.isbn13,
        mainCoverUrl: args.mainCoverUrl,
        ...(args.publisherId !== undefined && { publisherId: args.publisherId }),
        updatedAt: Date.now(),
      })
      return existing._id
    }

    // Create new edition
    const editionId = await context.db.insert('bookEditions', {
      bookId: args.bookId,
      source: args.source,
      sourceId: args.sourceId,
      sourceUrl: args.sourceUrl,
      format: args.format,
      isbn10: args.isbn10,
      isbn13: args.isbn13,
      mainCoverUrl: args.mainCoverUrl,
      ...(args.publisherId !== undefined && { publisherId: args.publisherId }),
      createdAt: Date.now(),
    })

    return editionId
  },
})

/**
 * Delete all editions for a book (used when deleting a book).
 */
export const deleteByBookId = internalMutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.number(),
  handler: async (context, args) => {
    const editions = await context.db
      .query('bookEditions')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const edition of editions) {
      await context.db.delete(edition._id)
    }

    return editions.length
  },
})
