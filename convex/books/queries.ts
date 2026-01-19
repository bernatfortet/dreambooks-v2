import { query, internalQuery } from '../_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

export const list = query({
  handler: async (context) => {
    const books = await context.db.query('books').order('desc').collect()

    // Resolve cover URLs for all books
    const booksWithUrls = await Promise.all(
      books.map(async (book) => {
        const coverUrl = book.coverStorageId ? await context.storage.getUrl(book.coverStorageId) : null

        return { ...book, coverUrl }
      }),
    )

    return booksWithUrls
  },
})

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (context, args) => {
    const paginatedResult = await context.db
      .query('books')
      .order('desc')
      .paginate(args.paginationOpts)

    const booksWithUrls = await Promise.all(
      paginatedResult.page.map(async (book) => {
        const coverUrl = book.coverStorageId ? await context.storage.getUrl(book.coverStorageId) : null

        return { ...book, coverUrl }
      }),
    )

    return {
      ...paginatedResult,
      page: booksWithUrls,
    }
  },
})

export const get = query({
  args: { id: v.id('books') },
  handler: async (context, args) => {
    const book = await context.db.get(args.id)
    if (!book) return null

    const coverUrl = book.coverStorageId ? await context.storage.getUrl(book.coverStorageId) : null

    // Include series info if book is linked to a series
    let seriesInfo = null
    if (book.seriesId) {
      const series = await context.db.get(book.seriesId)
      if (series) {
        seriesInfo = {
          _id: series._id,
          name: series.name,
          sourceUrl: series.sourceUrl,
          scrapeStatus: series.scrapeStatus,
        }
      }
    }

    return { ...book, coverUrl, seriesInfo }
  },
})

// Internal query for use in actions (no URL resolution needed)
export const getInternal = internalQuery({
  args: { id: v.id('books') },
  handler: async (context, args) => {
    const book = await context.db.get(args.id)

    return book
  },
})

// Internal query to find a book by ASIN
export const findByAsin = internalQuery({
  args: { asin: v.string() },
  handler: async (context, args) => {
    const book = await context.db
      .query('books')
      .withIndex('by_asin', (q) => q.eq('asin', args.asin))
      .unique()

    return book
  },
})

/**
 * Check if a book needs a cover download.
 * Returns true if book has no coverStorageId and coverStatus is not 'complete'.
 */
export const needsCoverDownload = internalQuery({
  args: { bookId: v.id('books') },
  returns: v.boolean(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) return false

    return !book.coverStorageId && book.coverStatus !== 'complete'
  },
})

/**
 * Get books that need enrichment (basic details only).
 * Used by local scraping worker.
 */
export const listNeedingEnrichment = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('books'),
      title: v.string(),
      amazonUrl: v.optional(v.string()),
      asin: v.optional(v.string()),
      detailsStatus: v.optional(v.string()),
    })
  ),
  handler: async (context, args) => {
    const limit = args.limit ?? 10

    // Get books with 'basic' or 'queued' detailsStatus
    const basicBooks = await context.db
      .query('books')
      .withIndex('by_detailsStatus', (q) => q.eq('detailsStatus', 'basic'))
      .take(limit)

    const queuedBooks = await context.db
      .query('books')
      .withIndex('by_detailsStatus', (q) => q.eq('detailsStatus', 'queued'))
      .take(limit - basicBooks.length)

    const books = [...basicBooks, ...queuedBooks].slice(0, limit)

    return books.map((book) => ({
      _id: book._id,
      title: book.title,
      amazonUrl: book.amazonUrl,
      asin: book.asin,
      detailsStatus: book.detailsStatus,
    }))
  },
})
