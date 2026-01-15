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
 * Get a series with its books and discoveries.
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
          scrapeStatus: book.scrapeStatus,
          coverStatus: book.coverStatus,
        }
      })
    )

    // Sort books by series position
    booksWithCovers.sort((a, b) => (a.seriesPosition ?? 999) - (b.seriesPosition ?? 999))

    // Get pending discoveries
    const discoveries = await context.db
      .query('seriesBookDiscoveries')
      .withIndex('by_seriesId', (q) => q.eq('seriesId', args.id))
      .collect()

    // Sort discoveries by position
    discoveries.sort((a, b) => (a.position ?? 999) - (b.position ?? 999))

    return {
      ...series,
      coverUrl,
      books: booksWithCovers,
      discoveries,
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
 * Get a discovery by ID (internal, for use in actions).
 */
export const getDiscovery = internalQuery({
  args: { id: v.id('seriesBookDiscoveries') },
  handler: async (context, args) => {
    const discovery = await context.db.get(args.id)

    return discovery
  },
})

/**
 * Internal: Find discovery by normalized URL.
 */
export const findDiscoveryByUrl = internalQuery({
  args: { normalizedUrl: v.string() },
  handler: async (context, args) => {
    const discovery = await context.db
      .query('seriesBookDiscoveries')
      .withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', args.normalizedUrl))
      .unique()

    return discovery
  },
})
