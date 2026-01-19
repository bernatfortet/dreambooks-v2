import { query, internalQuery } from '../_generated/server'
import { v } from 'convex/values'

/**
 * List all series for display.
 */
export const list = query({
  handler: async (context) => {
    const allSeries = await context.db.query('series').order('desc').collect()

    const seriesWithCovers = await Promise.all(
      allSeries.map(async (series) => {
        const coverUrl = series.coverStorageId
          ? await context.storage.getUrl(series.coverStorageId)
          : null

        return {
          _id: series._id,
          name: series.name,
          source: series.source,
          coverUrl,
          expectedBookCount: series.expectedBookCount,
          discoveredBookCount: series.discoveredBookCount,
          scrapedBookCount: series.scrapedBookCount,
          completeness: series.completeness,
          scrapeStatus: series.scrapeStatus,
          createdAt: series.createdAt,
        }
      })
    )

    return seriesWithCovers
  },
})

/**
 * Get a single series by ID.
 */
export const get = query({
  args: { id: v.id('series') },
  handler: async (context, args) => {
    const series = await context.db.get(args.id)
    if (!series) return null

    const coverUrl = series.coverStorageId
      ? await context.storage.getUrl(series.coverStorageId)
      : null

    return { ...series, coverUrl }
  },
})

/**
 * Get a series with its books (user-facing, no discoveries).
 */
export const getWithBooks = query({
  args: { id: v.id('series') },
  handler: async (context, args) => {
    const series = await context.db.get(args.id)
    if (!series) return null

    const coverUrl = series.coverStorageId
      ? await context.storage.getUrl(series.coverStorageId)
      : null

    // Get scraped books in this series
    const books = await context.db
      .query('books')
      .withIndex('by_seriesId', (query) => query.eq('seriesId', args.id))
      .collect()

    const booksWithCovers = await Promise.all(
      books.map(async (book) => {
        const bookCoverUrl = book.coverStorageId
          ? await context.storage.getUrl(book.coverStorageId)
          : null

        return {
          _id: book._id,
          title: book.title,
          authors: book.authors,
          seriesPosition: book.seriesPosition,
          coverUrl: bookCoverUrl,
        }
      }),
    )

    // Sort books by series position
    booksWithCovers.sort((a, b) => (a.seriesPosition ?? 999) - (b.seriesPosition ?? 999))

    return {
      _id: series._id,
      name: series.name,
      description: series.description,
      coverUrl,
      books: booksWithCovers,
    }
  },
})

/**
 * Get a series with its books (admin view with status fields).
 */
export const getWithDiscoveries = query({
  args: { id: v.id('series') },
  handler: async (context, args) => {
    const series = await context.db.get(args.id)
    if (!series) return null

    const coverUrl = series.coverStorageId
      ? await context.storage.getUrl(series.coverStorageId)
      : null

    // Get scraped books in this series
    const books = await context.db
      .query('books')
      .withIndex('by_seriesId', (q) => q.eq('seriesId', args.id))
      .collect()

    const booksWithCovers = await Promise.all(
      books.map(async (book) => {
        const bookCoverUrl = book.coverStorageId
          ? await context.storage.getUrl(book.coverStorageId)
          : null

        return {
          _id: book._id,
          title: book.title,
          authors: book.authors,
          seriesPosition: book.seriesPosition,
          coverUrl: bookCoverUrl,
          detailsStatus: book.detailsStatus,
          coverStatus: book.coverStatus,
        }
      })
    )

    // Sort books by series position
    booksWithCovers.sort((a, b) => (a.seriesPosition ?? 999) - (b.seriesPosition ?? 999))

    return {
      ...series,
      coverUrl,
      books: booksWithCovers,
      // Empty discoveries array for backward compatibility during migration
      discoveries: [],
    }
  },
})

/**
 * Internal query for getting series by ID (used in actions).
 */
export const getInternal = internalQuery({
  args: { id: v.id('series') },
  handler: async (context, args) => {
    const series = await context.db.get(args.id)

    return series
  },
})

/**
 * Get a series by its source URL.
 * Used to check if a series already exists before adding to queue.
 */
export const getBySourceUrl = query({
  args: {
    sourceUrl: v.string(),
  },
  handler: async (context, args) => {
    return await context.db
      .query('series')
      .withIndex('by_sourceUrl', (q) => q.eq('sourceUrl', args.sourceUrl))
      .first()
  },
})

/**
 * Get series that need scraping (pending or partial status).
 * Used by local scraping worker.
 */
export const listNeedingScrape = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('series'),
      name: v.string(),
      sourceUrl: v.optional(v.string()),
      nextPageUrl: v.optional(v.string()),
      scrapeStatus: v.string(),
    })
  ),
  handler: async (context, args) => {
    const limit = args.limit ?? 10

    // Get series with 'pending' scrapeStatus that have a sourceUrl
    const pendingSeries = await context.db
      .query('series')
      .withIndex('by_scrapeStatus', (q) => q.eq('scrapeStatus', 'pending'))
      .take(limit * 2)

    // Get series with 'partial' scrapeStatus (pagination incomplete)
    const partialSeries = await context.db
      .query('series')
      .withIndex('by_scrapeStatus', (q) => q.eq('scrapeStatus', 'partial'))
      .take(limit * 2)

    // Filter to only those with a URL to scrape
    const allSeries = [...pendingSeries, ...partialSeries].filter((s) => {
      if (s.scrapeStatus === 'partial') return !!s.nextPageUrl
      return !!s.sourceUrl
    })

    return allSeries.slice(0, limit).map((series) => ({
      _id: series._id,
      name: series.name,
      sourceUrl: series.sourceUrl,
      nextPageUrl: series.nextPageUrl,
      scrapeStatus: series.scrapeStatus ?? 'pending',
    }))
  },
})

/**
 * Get series that need URL discovery (pending status, no sourceUrl, but has books).
 * Used by local scraping worker to find series URLs from book pages.
 */
export const listNeedingUrlDiscovery = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('series'),
      name: v.string(),
      bookAmazonUrl: v.string(),
    })
  ),
  handler: async (context, args) => {
    const limit = args.limit ?? 5

    // Get pending series without sourceUrl
    const pendingSeries = await context.db
      .query('series')
      .withIndex('by_scrapeStatus', (q) => q.eq('scrapeStatus', 'pending'))
      .take(limit * 3)

    const seriesNeedingUrl = pendingSeries.filter((s) => !s.sourceUrl)

    const results: Array<{ _id: typeof seriesNeedingUrl[0]['_id']; name: string; bookAmazonUrl: string }> = []

    for (const series of seriesNeedingUrl) {
      if (results.length >= limit) break

      // Find a book in this series with an amazonUrl
      const book = await context.db
        .query('books')
        .withIndex('by_seriesId', (q) => q.eq('seriesId', series._id))
        .first()

      if (book?.amazonUrl) {
        results.push({
          _id: series._id,
          name: series.name,
          bookAmazonUrl: book.amazonUrl,
        })
      }
    }

    return results
  },
})
