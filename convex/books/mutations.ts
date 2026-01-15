import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

// Args shape reused across create and upsert
const bookArgs = {
  title: v.string(),
  subtitle: v.optional(v.string()),
  authors: v.array(v.string()),
  isbn10: v.optional(v.string()),
  isbn13: v.optional(v.string()),
  asin: v.optional(v.string()),
  amazonUrl: v.optional(v.string()),
  // Series
  seriesName: v.optional(v.string()),
  seriesUrl: v.optional(v.string()),
  seriesPosition: v.optional(v.number()),
  // Details
  publisher: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  description: v.optional(v.string()),
  coverSourceUrl: v.optional(v.string()),
  lexileScore: v.optional(v.number()),
  ageRange: v.optional(v.string()),
  gradeLevel: v.optional(v.string()),
  source: v.string(),
  scrapeStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
  coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
  scrapedAt: v.number(),
}

export const create = internalMutation({
  args: bookArgs,
  handler: async (context: any, args: any) => {
    const id = await context.db.insert('books', args)

    return id
  },
})

export const upsertFromScrape = internalMutation({
  args: bookArgs,
  handler: async (context: any, args: any) => {
    // If asin exists, use it as primary idempotency key
    if (args.asin) {
      const existingByAsin = await context.db
        .query('books')
        .withIndex('by_asin', (q: any) => q.eq('asin', args.asin))
        .unique()

      if (existingByAsin) {
        console.log('💾 Updating existing book by ASIN', { asin: args.asin, bookId: existingByAsin._id })
        await context.db.patch(existingByAsin._id, args)

        return existingByAsin._id
      }
    }

    // Fallback: isbn13
    if (args.isbn13) {
      const existingByIsbn = await context.db
        .query('books')
        .withIndex('by_isbn13', (q: any) => q.eq('isbn13', args.isbn13))
        .unique()

      if (existingByIsbn) {
        console.log('💾 Updating existing book by ISBN13', { isbn13: args.isbn13, bookId: existingByIsbn._id })
        await context.db.patch(existingByIsbn._id, args)

        return existingByIsbn._id
      }
    }

    // No existing book found, insert new
    console.log('💾 Inserting new book', { title: args.title })
    const bookId = await context.db.insert('books', args)

    return bookId
  },
})

export const updateCover = internalMutation({
  args: {
    bookId: v.id('books'),
    coverStorageId: v.id('_storage'),
    coverBlurHash: v.optional(v.string()),
    coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
  },
  handler: async (context: any, args: any) => {
    await context.db.patch(args.bookId, {
      coverStorageId: args.coverStorageId,
      coverBlurHash: args.coverBlurHash ?? undefined,
      coverStatus: args.coverStatus,
    })
  },
})

export const updateStatus = internalMutation({
  args: {
    bookId: v.id('books'),
    scrapeStatus: v.optional(v.union(v.literal('pending'), v.literal('complete'), v.literal('error'))),
    coverStatus: v.optional(v.union(v.literal('pending'), v.literal('complete'), v.literal('error'))),
    errorMessage: v.optional(v.string()),
  },
  handler: async (context: any, args: any) => {
    const { bookId, ...updates } = args

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    )

    await context.db.patch(bookId, filteredUpdates)
  },
})
