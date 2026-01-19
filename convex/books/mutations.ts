import { internalMutation, mutation } from '../_generated/server'
import { v } from 'convex/values'

// Args shape reused across create and upsert
const bookArgs = {
  title: v.string(),
  subtitle: v.optional(v.string()),
  authors: v.array(v.string()),
  // Amazon author IDs extracted from byline links - used for linking to authors table
  amazonAuthorIds: v.optional(v.array(v.string())),
  isbn10: v.optional(v.string()),
  isbn13: v.optional(v.string()),
  asin: v.optional(v.string()),
  amazonUrl: v.optional(v.string()),
  // Available formats (hardcover, paperback, kindle, audiobook, etc.)
  formats: v.optional(
    v.array(
      v.object({
        type: v.string(),
        asin: v.string(),
        amazonUrl: v.string(),
      })
    )
  ),
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
  detailsStatus: v.union(
    v.literal('basic'),
    v.literal('queued'),
    v.literal('complete'),
    v.literal('error'),
  ),
  coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
  scrapedAt: v.number(),
}

export const create = internalMutation({
  args: bookArgs,
  handler: async (context, args) => {
    const id = await context.db.insert('books', args)

    return id
  },
})

/**
 * @deprecated Use internal.books.internal.createOrUpdate instead for new code.
 * This mutation is kept for backward compatibility.
 */
export const upsertFromScrape = internalMutation({
  args: bookArgs,
  handler: async (context, args) => {
    // Clean title: remove series names in parentheses
    const cleanedTitle = args.title?.replace(/\s*\([^)]+\)\s*$/, '').trim() || args.title
    const cleanedArgs = { ...args, title: cleanedTitle }

    // If asin exists, use it as primary idempotency key
    if (cleanedArgs.asin) {
      const existingByAsin = await context.db
        .query('books')
        .withIndex('by_asin', (q) => q.eq('asin', cleanedArgs.asin))
        .unique()

      if (existingByAsin) {
        await context.db.patch(existingByAsin._id, cleanedArgs)
        return existingByAsin._id
      }
    }

    // Fallback: isbn13
    if (cleanedArgs.isbn13) {
      const existingByIsbn = await context.db
        .query('books')
        .withIndex('by_isbn13', (q) => q.eq('isbn13', cleanedArgs.isbn13))
        .unique()

      if (existingByIsbn) {
        await context.db.patch(existingByIsbn._id, cleanedArgs)
        return existingByIsbn._id
      }
    }

    // No existing book found, insert new
    const bookId = await context.db.insert('books', cleanedArgs)
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
  handler: async (context, args) => {
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
    detailsStatus: v.optional(
      v.union(v.literal('basic'), v.literal('queued'), v.literal('complete'), v.literal('error'))
    ),
    coverStatus: v.optional(v.union(v.literal('pending'), v.literal('complete'), v.literal('error'))),
    errorMessage: v.optional(v.string()),
  },
  handler: async (context, args) => {
    const { bookId, ...updates } = args

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    )

    await context.db.patch(bookId, filteredUpdates)
  },
})

/**
 * Update a book's series URL (admin utility).
 */
export const updateSeriesUrl = mutation({
  args: {
    bookId: v.id('books'),
    seriesUrl: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)

    if (!book) {
      throw new Error('Book not found')
    }

    console.log('💾 Updating book seriesUrl', { bookId: args.bookId, seriesUrl: args.seriesUrl })

    await context.db.patch(args.bookId, {
      seriesUrl: args.seriesUrl,
    })

    return null
  },
})

/**
 * Update a book's series information (name, URL, position).
 */
export const updateSeriesInfo = mutation({
  args: {
    bookId: v.id('books'),
    seriesName: v.string(),
    seriesUrl: v.string(),
    seriesPosition: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)

    if (!book) {
      throw new Error('Book not found')
    }

    console.log('💾 Updating book series info', {
      bookId: args.bookId,
      seriesName: args.seriesName,
      seriesUrl: args.seriesUrl,
      seriesPosition: args.seriesPosition,
    })

    await context.db.patch(args.bookId, {
      seriesName: args.seriesName,
      seriesUrl: args.seriesUrl,
      seriesPosition: args.seriesPosition,
    })

    return null
  },
})

/**
 * Delete a book (admin utility).
 */
export const deleteBook = mutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)

    if (!book) {
      throw new Error('Book not found')
    }

    console.log('🗑️ Deleting book', { bookId: args.bookId, title: book.title })

    // Delete the book
    await context.db.delete(args.bookId)

    return null
  },
})

/**
 * Update a book with enriched data from scraping.
 * Used by local scraping worker.
 */
export const updateFromEnrichment = mutation({
  args: {
    bookId: v.id('books'),
    subtitle: v.optional(v.string()),
    isbn10: v.optional(v.string()),
    isbn13: v.optional(v.string()),
    asin: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),
    publisher: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    description: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    lexileScore: v.optional(v.number()),
    ageRange: v.optional(v.string()),
    gradeLevel: v.optional(v.string()),
    seriesName: v.optional(v.string()),
    seriesUrl: v.optional(v.string()),
    seriesPosition: v.optional(v.number()),
    // Available formats
    formats: v.optional(
      v.array(
        v.object({
          type: v.string(),
          asin: v.string(),
          amazonUrl: v.string(),
        })
      )
    ),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const { bookId, coverImageUrl, ...updates } = args

    const book = await context.db.get(bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    console.log('📝 Enriching book', { bookId, title: book.title })

    // Build update object, only including defined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    )

    // Mark as complete and update scrapedAt
    await context.db.patch(bookId, {
      ...filteredUpdates,
      coverSourceUrl: coverImageUrl,
      detailsStatus: 'complete',
      scrapedAt: Date.now(),
    })

    // Schedule cover download if we have a new cover URL and cover isn't already downloaded
    if (coverImageUrl && !book.coverStorageId && book.coverStatus !== 'complete') {
      const { internal } = await import('../_generated/api')
      await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
        bookId,
        sourceUrl: coverImageUrl,
      })
    }

    return null
  },
})

/**
 * Mark a book as having an enrichment error.
 * Used by local scraping worker.
 */
export const markEnrichmentError = mutation({
  args: {
    bookId: v.id('books'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    console.log('🚨 Marking book enrichment error', { bookId: args.bookId, error: args.errorMessage })

    await context.db.patch(args.bookId, {
      detailsStatus: 'error',
      errorMessage: args.errorMessage,
    })

    return null
  },
})
