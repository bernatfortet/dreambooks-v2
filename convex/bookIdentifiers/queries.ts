import { query, internalQuery } from '../_generated/server'
import { v } from 'convex/values'
import { normalizeIdentifier } from '../lib/identifiers'

/**
 * Find the canonical book by any identifier (ASIN, ISBN-10, ISBN-13).
 * This is the main lookup path for deduplication and resolution.
 */
export const findBookByIdentifier = internalQuery({
  args: {
    type: v.union(v.literal('asin'), v.literal('isbn10'), v.literal('isbn13')),
    value: v.string(),
  },
  handler: async (context, args) => {
    const normalizedValue = normalizeIdentifier(args.type, args.value)

    const identifier = await context.db
      .query('bookIdentifiers')
      .withIndex('by_type_value', (q) => q.eq('type', args.type).eq('value', normalizedValue))
      .unique()

    if (!identifier) return null

    const book = await context.db.get(identifier.bookId)
    return book
  },
})

/**
 * Resolve any identifier to a canonical book.
 * Tries ASIN first, then ISBN-13, then ISBN-10.
 */
export const resolveToBook = internalQuery({
  args: {
    asin: v.optional(v.string()),
    isbn10: v.optional(v.string()),
    isbn13: v.optional(v.string()),
  },
  handler: async (context, args) => {
    // Try ASIN first (most reliable for Amazon)
    if (args.asin) {
      const asinUpper = args.asin.toUpperCase()
      const identifier = await context.db
        .query('bookIdentifiers')
        .withIndex('by_type_value', (q) => q.eq('type', 'asin').eq('value', asinUpper))
        .unique()

      if (identifier) {
        const book = await context.db.get(identifier.bookId)
        if (book) return { book, matchedBy: 'asin' as const }
      }
    }

    // Try ISBN-13
    if (args.isbn13) {
      const normalizedIsbn13 = args.isbn13.replace(/[-\s]/g, '')
      const identifier = await context.db
        .query('bookIdentifiers')
        .withIndex('by_type_value', (q) => q.eq('type', 'isbn13').eq('value', normalizedIsbn13))
        .unique()

      if (identifier) {
        const book = await context.db.get(identifier.bookId)
        if (book) return { book, matchedBy: 'isbn13' as const }
      }
    }

    // Try ISBN-10
    if (args.isbn10) {
      const normalizedIsbn10 = args.isbn10.replace(/[-\s]/g, '')
      const identifier = await context.db
        .query('bookIdentifiers')
        .withIndex('by_type_value', (q) => q.eq('type', 'isbn10').eq('value', normalizedIsbn10))
        .unique()

      if (identifier) {
        const book = await context.db.get(identifier.bookId)
        if (book) return { book, matchedBy: 'isbn10' as const }
      }
    }

    return null
  },
})

/**
 * List all identifiers for a book.
 */
export const listByBookId = query({
  args: {
    bookId: v.id('books'),
  },
  returns: v.array(
    v.object({
      _id: v.id('bookIdentifiers'),
      _creationTime: v.number(),
      bookId: v.id('books'),
      type: v.union(v.literal('asin'), v.literal('isbn10'), v.literal('isbn13')),
      value: v.string(),
      editionId: v.optional(v.id('bookEditions')),
      source: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),
      firstSeenAt: v.number(),
    }),
  ),
  handler: async (context, args) => {
    return await context.db
      .query('bookIdentifiers')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()
  },
})
