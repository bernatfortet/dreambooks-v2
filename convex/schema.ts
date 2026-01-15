import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // ===================
  // BOOKS
  // ===================

  bookScrapeRuns: defineTable({
    url: v.string(),
    adapter: v.string(), // 'amazon', etc.

    // For quick debugging without pulling full raw payload
    extracted: v.optional(
      v.object({
        title: v.optional(v.string()),
        authors: v.optional(v.array(v.string())),
        asin: v.optional(v.string()),
        isbn10: v.optional(v.string()),
        isbn13: v.optional(v.string()),
        coverImageUrl: v.optional(v.string()),
      }),
    ),

    status: v.union(v.literal('running'), v.literal('complete'), v.literal('error')),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  }).index('by_status', ['status']),

  books: defineTable({
    // Core info
    title: v.string(),
    subtitle: v.optional(v.string()),
    authors: v.array(v.string()),

    // Identifiers
    isbn10: v.optional(v.string()),
    isbn13: v.optional(v.string()),
    asin: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),

    // Series link (foreign key to series table)
    seriesId: v.optional(v.id('series')),
    // Raw scraped series data (kept for reference before series is created)
    seriesName: v.optional(v.string()),
    seriesUrl: v.optional(v.string()),
    seriesPosition: v.optional(v.number()),

    // Details
    publisher: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    description: v.optional(v.string()), // Clean description for SEO/display

    // Cover image
    coverStorageId: v.optional(v.id('_storage')),
    coverSourceUrl: v.optional(v.string()),
    coverBlurHash: v.optional(v.string()),

    // Reading level
    lexileScore: v.optional(v.number()),
    ageRange: v.optional(v.string()),
    gradeLevel: v.optional(v.string()),

    // Metadata
    source: v.string(), // 'amazon', 'openlibrary', etc.
    scrapeStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    scrapedAt: v.number(),
    errorMessage: v.optional(v.string()),
  })
    .index('by_scrapeStatus', ['scrapeStatus'])
    .index('by_coverStatus', ['coverStatus'])
    .index('by_asin', ['asin'])
    .index('by_isbn13', ['isbn13'])
    .index('by_seriesId', ['seriesId']),

  // ===================
  // SERIES
  // ===================

  series: defineTable({
    // Identity
    name: v.string(),

    // Source-agnostic pointer
    source: v.string(), // 'amazon', 'openlibrary', 'manual'
    sourceUrl: v.optional(v.string()),
    sourceId: v.optional(v.string()), // e.g., amazonSeriesId

    // Display
    description: v.optional(v.string()),
    coverStorageId: v.optional(v.id('_storage')),
    coverSourceUrl: v.optional(v.string()),

    // Completeness tracking
    expectedBookCount: v.optional(v.number()),
    discoveredBookCount: v.optional(v.number()),
    scrapedBookCount: v.optional(v.number()),
    completeness: v.union(
      v.literal('unknown'), // No expected count available
      v.literal('partial'), // discoveredBookCount < expectedBookCount
      v.literal('confident'), // discoveredBookCount >= expectedBookCount
    ),

    // Pagination state
    lastScrapedPage: v.optional(v.number()),
    totalPages: v.optional(v.number()),
    nextPageUrl: v.optional(v.string()),

    // State machine
    scrapeStatus: v.union(
      v.literal('pending'), // Created, not yet scraped
      v.literal('processing'), // Currently scraping
      v.literal('partial'), // Invariant: nextPageUrl must exist
      v.literal('complete'), // Invariant: nextPageUrl must be null
      v.literal('error'),
    ),
    lastScrapedAt: v.optional(v.number()),
    lastAttemptedAt: v.optional(v.number()),
    nextRefreshAfter: v.optional(v.number()),
    errorMessage: v.optional(v.string()),

    // Meta
    createdAt: v.number(),
  })
    .index('by_sourceId', ['sourceId'])
    .index('by_sourceUrl', ['sourceUrl'])
    .index('by_scrapeStatus', ['scrapeStatus'])
    .index('by_name', ['name']),

  seriesBookDiscoveries: defineTable({
    seriesId: v.id('series'),

    // Source-agnostic pointer
    source: v.string(),
    sourceUrl: v.string(),
    sourceId: v.optional(v.string()), // asin if extractable
    normalizedUrl: v.string(), // For deduplication

    // Display (from series page)
    title: v.optional(v.string()),
    position: v.optional(v.number()),

    // Status
    status: v.union(
      v.literal('pending'), // Discovered, not scraped
      v.literal('complete'), // Successfully scraped and linked
      v.literal('skipped'), // Already existed in DB
      v.literal('error'),
    ),
    bookId: v.optional(v.id('books')),

    // Meta
    discoveredAt: v.number(),
    scrapedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  })
    .index('by_seriesId', ['seriesId'])
    .index('by_status', ['status'])
    .index('by_normalizedUrl', ['normalizedUrl'])
    .index('by_sourceId', ['sourceId'])
    .index('by_seriesId_status', ['seriesId', 'status']),

  seriesScrapeRuns: defineTable({
    seriesId: v.id('series'),

    // What was scraped
    adapter: v.string(), // 'amazon', etc.
    sourceUrl: v.string(),
    pageScraped: v.optional(v.number()),

    // Run status (mirrors bookScrapeRuns pattern)
    status: v.union(v.literal('running'), v.literal('complete'), v.literal('error')),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),

    // Small extracted snapshot for debugging
    extracted: v.optional(
      v.object({
        seriesName: v.optional(v.string()),
        expectedBookCount: v.optional(v.number()),
        booksFound: v.optional(v.number()),
        coverUrl: v.optional(v.string()),
      }),
    ),
  }).index('by_seriesId', ['seriesId']),
})
