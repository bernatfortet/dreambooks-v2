import { internalMutation, mutation } from '../_generated/server'
import { v } from 'convex/values'
import { extractSeriesId, normalizeAmazonUrl } from '../scraping/adapters/amazon/url'

/**
 * Upsert a series by source identifiers.
 * Deduplication order: sourceId > sourceUrl > name
 */
export const upsert = internalMutation({
  args: {
    name: v.string(),
    source: v.string(),
    sourceUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (context, args) => {
    // Extract sourceId from URL if amazon
    let sourceId: string | undefined
    if (args.source === 'amazon' && args.sourceUrl) {
      sourceId = extractSeriesId(args.sourceUrl) ?? undefined
    }

    // Try to find existing by sourceId
    if (sourceId) {
      const existingBySourceId = await context.db
        .query('series')
        .withIndex('by_sourceId', (q) => q.eq('sourceId', sourceId))
        .unique()

      if (existingBySourceId) {
        console.log('💾 Found series by sourceId', { sourceId, seriesId: existingBySourceId._id })

        return existingBySourceId._id
      }
    }

    // Try to find existing by normalized sourceUrl
    if (args.sourceUrl) {
      const normalizedUrl = normalizeAmazonUrl(args.sourceUrl)
      const existingByUrl = await context.db
        .query('series')
        .withIndex('by_sourceUrl', (q) => q.eq('sourceUrl', normalizedUrl))
        .unique()

      if (existingByUrl) {
        console.log('💾 Found series by sourceUrl', { sourceUrl: normalizedUrl, seriesId: existingByUrl._id })

        return existingByUrl._id
      }
    }

    // Try to find existing by normalized name (last resort)
    const normalizedName = args.name.toLowerCase().trim()
    const allSeries = await context.db.query('series').withIndex('by_name').collect()
    const existingByName = allSeries.find((s) => s.name.toLowerCase().trim() === normalizedName)

    if (existingByName) {
      console.log('💾 Found series by name', { name: args.name, seriesId: existingByName._id })

      // Update sourceUrl/sourceId if we have better data
      if (args.sourceUrl && !existingByName.sourceUrl) {
        await context.db.patch(existingByName._id, {
          sourceUrl: args.sourceUrl,
          sourceId,
        })
      }

      return existingByName._id
    }

    // Create new series
    console.log('💾 Creating new series', { name: args.name, sourceId })

    const seriesId = await context.db.insert('series', {
      name: args.name,
      source: args.source,
      sourceUrl: args.sourceUrl,
      sourceId,
      description: args.description,
      completeness: 'unknown',
      scrapeStatus: 'pending',
      createdAt: Date.now(),
    })

    return seriesId
  },
})

/**
 * Update series scrape status.
 */
export const updateStatus = internalMutation({
  args: {
    seriesId: v.id('series'),
    scrapeStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('processing'),
        v.literal('partial'),
        v.literal('complete'),
        v.literal('error')
      )
    ),
    completeness: v.optional(
      v.union(v.literal('unknown'), v.literal('partial'), v.literal('confident'))
    ),
    lastScrapedAt: v.optional(v.number()),
    lastAttemptedAt: v.optional(v.number()),
    nextPageUrl: v.optional(v.string()),
    lastScrapedPage: v.optional(v.number()),
    totalPages: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (context, args) => {
    const { seriesId, ...updates } = args

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    )

    await context.db.patch(seriesId, filteredUpdates)
  },
})

/**
 * Update series from scrape results.
 */
export const updateFromScrape = internalMutation({
  args: {
    seriesId: v.id('series'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    coverSourceUrl: v.optional(v.string()),
    expectedBookCount: v.optional(v.number()),
    discoveredBookCount: v.optional(v.number()),
    lastScrapedPage: v.optional(v.number()),
    totalPages: v.optional(v.number()),
    nextPageUrl: v.optional(v.string()),
  },
  handler: async (context, args) => {
    const { seriesId, ...updates } = args

    // Calculate completeness
    let completeness: 'unknown' | 'partial' | 'confident' = 'unknown'
    if (updates.expectedBookCount !== undefined && updates.discoveredBookCount !== undefined) {
      completeness =
        updates.discoveredBookCount >= updates.expectedBookCount ? 'confident' : 'partial'
    }

    // Calculate scrapeStatus based on pagination
    let scrapeStatus: 'partial' | 'complete' = 'complete'
    if (updates.nextPageUrl) {
      scrapeStatus = 'partial'
    }

    await context.db.patch(seriesId, {
      ...updates,
      completeness,
      scrapeStatus,
      lastScrapedAt: Date.now(),
    })
  },
})

/**
 * Link a book to a series.
 */
export const linkBook = internalMutation({
  args: {
    bookId: v.id('books'),
    seriesId: v.id('series'),
    seriesPosition: v.optional(v.number()),
  },
  handler: async (context, args) => {
    await context.db.patch(args.bookId, {
      seriesId: args.seriesId,
      seriesPosition: args.seriesPosition,
    })

    // Update scraped book count
    const booksInSeries = await context.db
      .query('books')
      .withIndex('by_seriesId', (q) => q.eq('seriesId', args.seriesId))
      .collect()

    await context.db.patch(args.seriesId, {
      scrapedBookCount: booksInSeries.length,
    })
  },
})

/**
 * Create a discovery record for a book found in a series.
 */
export const createDiscovery = internalMutation({
  args: {
    seriesId: v.id('series'),
    source: v.string(),
    sourceUrl: v.string(),
    sourceId: v.optional(v.string()),
    normalizedUrl: v.string(),
    title: v.optional(v.string()),
    position: v.optional(v.number()),
    status: v.union(
      v.literal('pending'),
      v.literal('complete'),
      v.literal('skipped'),
      v.literal('error')
    ),
    bookId: v.optional(v.id('books')),
  },
  handler: async (context, args) => {
    // Check if discovery already exists by normalizedUrl
    const existing = await context.db
      .query('seriesBookDiscoveries')
      .withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', args.normalizedUrl))
      .unique()

    if (existing) {
      console.log('💾 Discovery already exists', { normalizedUrl: args.normalizedUrl })

      return existing._id
    }

    const discoveryId = await context.db.insert('seriesBookDiscoveries', {
      ...args,
      discoveredAt: Date.now(),
    })

    return discoveryId
  },
})

/**
 * Update a discovery after scraping the book.
 */
export const updateDiscovery = internalMutation({
  args: {
    discoveryId: v.id('seriesBookDiscoveries'),
    status: v.union(
      v.literal('pending'),
      v.literal('complete'),
      v.literal('skipped'),
      v.literal('error')
    ),
    bookId: v.optional(v.id('books')),
    errorMessage: v.optional(v.string()),
  },
  handler: async (context, args) => {
    const { discoveryId, ...updates } = args

    await context.db.patch(discoveryId, {
      ...updates,
      scrapedAt: updates.status === 'complete' ? Date.now() : undefined,
    })
  },
})

/**
 * Create a series scrape run (audit trail).
 */
export const createScrapeRun = internalMutation({
  args: {
    seriesId: v.id('series'),
    adapter: v.string(),
    sourceUrl: v.string(),
    pageScraped: v.optional(v.number()),
  },
  handler: async (context, args) => {
    const runId = await context.db.insert('seriesScrapeRuns', {
      ...args,
      status: 'running',
      startedAt: Date.now(),
    })

    return runId
  },
})

/**
 * Complete a series scrape run.
 */
export const completeScrapeRun = internalMutation({
  args: {
    runId: v.id('seriesScrapeRuns'),
    extracted: v.optional(
      v.object({
        seriesName: v.optional(v.string()),
        expectedBookCount: v.optional(v.number()),
        booksFound: v.optional(v.number()),
        coverUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (context, args) => {
    await context.db.patch(args.runId, {
      status: 'complete',
      extracted: args.extracted,
      finishedAt: Date.now(),
    })
  },
})

/**
 * Fail a series scrape run.
 */
export const failScrapeRun = internalMutation({
  args: {
    runId: v.id('seriesScrapeRuns'),
    errorMessage: v.string(),
  },
  handler: async (context, args) => {
    await context.db.patch(args.runId, {
      status: 'error',
      errorMessage: args.errorMessage,
      finishedAt: Date.now(),
    })
  },
})
