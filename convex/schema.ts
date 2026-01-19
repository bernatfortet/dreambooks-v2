import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // ===================
  // SCRAPE QUEUE
  // ===================

  scrapeQueue: defineTable({
    url: v.string(),
    type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('complete'),
      v.literal('error')
    ),
    priority: v.number(), // Lower = higher priority
    // Preview info for admin UI
    displayName: v.optional(v.string()), // Book title, series name, or author name
    // Options
    scrapeFullSeries: v.boolean(), // If book, also scrape its series and all books
    // Source tracking (optional for backward compat, defaults to 'user' in code)
    source: v.optional(v.union(v.literal('user'), v.literal('discovery'))),
    // Lease fields for safe concurrent processing
    leaseExpiresAt: v.optional(v.number()), // Timestamp when lease expires
    workerId: v.optional(v.string()), // Which worker holds the lease
    attemptCount: v.optional(v.number()), // For retry tracking
    // Results
    bookId: v.optional(v.id('books')),
    seriesId: v.optional(v.id('series')),
    authorId: v.optional(v.id('authors')),
    errorMessage: v.optional(v.string()),
    // Meta
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index('by_status', ['status'])
    .index('by_status_priority', ['status', 'priority'])
    .index('by_url', ['url']),

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
    // Amazon author IDs extracted from byline links - used for linking to authors table
    amazonAuthorIds: v.optional(v.array(v.string())),

    // Identifiers
    isbn10: v.optional(v.string()),
    isbn13: v.optional(v.string()),
    asin: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),

    // Available formats (extracted from "See all formats" section)
    formats: v.optional(
      v.array(
        v.object({
          type: v.string(), // 'hardcover', 'paperback', 'kindle', 'audiobook', etc.
          asin: v.string(),
          amazonUrl: v.string(),
        })
      )
    ),

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
    // MIGRATION NEEDED: Make detailsStatus required after backfilling existing records
    // Steps: 1) Backfill all null values to 'complete' for existing books with full data
    //        2) Remove v.optional wrapper
    detailsStatus: v.optional(
      v.union(
        v.literal('basic'), // Created from series listing, not enriched
        v.literal('queued'), // Queued for enrichment
        v.literal('complete'), // Fully scraped
        v.literal('error'), // Enrichment failed
      ),
    ),
    // DEPRECATED: Old field name, use detailsStatus instead
    // MIGRATION NEEDED: Remove after verifying no code references this field
    scrapeStatus: v.optional(
      v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    ),
    coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    scrapedAt: v.number(),
    errorMessage: v.optional(v.string()),
  })
    .index('by_detailsStatus', ['detailsStatus'])
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

  // Note: seriesBookDiscoveries table has been removed.
  // Book discoveries are now managed via the unified scrapeQueue system.

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

  // ===================
  // AUTHORS
  // ===================

  authors: defineTable({
    // Identity
    name: v.string(),
    bio: v.optional(v.string()),

    // Source - amazonAuthorId is the PRIMARY key for linking
    source: v.string(), // 'amazon'
    amazonAuthorId: v.string(), // e.g., 'B000APEZHY' - required, unique
    sourceUrl: v.optional(v.string()),

    // Image
    imageStorageId: v.optional(v.id('_storage')),
    imageSourceUrl: v.optional(v.string()),

    // Status
    scrapeStatus: v.union(
      v.literal('pending'),
      v.literal('complete'),
      v.literal('error')
    ),
    lastScrapedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index('by_amazonAuthorId', ['amazonAuthorId'])
    .index('by_name', ['name'])
    .index('by_scrapeStatus', ['scrapeStatus']),

  // Join table for book-author relationships (enables indexed "books by author" queries)
  bookAuthors: defineTable({
    bookId: v.id('books'),
    authorId: v.id('authors'),

    // How the link was established
    source: v.string(), // 'amazonAuthorId' | 'nameMatch'

    createdAt: v.number(),
  })
    .index('by_authorId', ['authorId']) // Critical: "all books by author X"
    .index('by_bookId', ['bookId']) // "all authors of book Y"
    .index('by_bookId_authorId', ['bookId', 'authorId']), // Uniqueness check
})
