import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  ...authTables,

  // ===================
  // SCRAPE QUEUE
  // ===================

  scrapeQueue: defineTable({
    url: v.string(),
    type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    status: v.union(v.literal('pending'), v.literal('processing'), v.literal('complete'), v.literal('error')),
    priority: v.number(), // Lower = higher priority
    // Preview info for admin UI
    displayName: v.optional(v.string()), // Book title, series name, or author name
    displayImageUrl: v.optional(v.string()), // Cover image or author photo URL
    // Options
    scrapeFullSeries: v.boolean(), // If book, also scrape its series and all books
    // Re-scrape skip options (used when re-scraping existing entities)
    skipSeriesLink: v.optional(v.boolean()), // Book: don't upsert/link series
    skipAuthorDiscovery: v.optional(v.boolean()), // Book: don't queue authors
    skipBookDiscoveries: v.optional(v.boolean()), // Series: don't queue books
    skipCoverDownload: v.optional(v.boolean()), // All: don't download cover/image
    // Source tracking (optional for backward compat, defaults to 'user' in code)
    source: v.optional(v.union(v.literal('user'), v.literal('discovery'))),
    // Provenance tracking - where this item came from
    referrerUrl: v.optional(v.string()), // URL that triggered this queue item
    referrerReason: v.optional(v.string()), // e.g., "book-series-link", "manual", "rescrape"
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
  // SCRAPE ARTIFACTS (offline audit trail)
  // ===================

  scrapeArtifacts: defineTable({
    entityType: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    entityId: v.optional(v.union(v.id('books'), v.id('series'), v.id('authors'))),

    sourceUrl: v.string(),
    adapter: v.string(), // 'amazon', 'playwright-local', etc.
    scrapeVersion: v.number(),

    // Raw payload produced by the scraper/parser (JSON string).
    // Keeping this lets us compare versions and debug regressions without re-hitting Amazon.
    payloadJson: v.string(),

    createdAt: v.number(),
  })
    .index('by_entityType', ['entityType'])
    .index('by_entityId', ['entityId'])
    .index('by_sourceUrl', ['sourceUrl'])
    .index('by_entityType_scrapeVersion', ['entityType', 'scrapeVersion']),

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
    authors: v.array(v.string()), // Kept for backward compatibility - derived from contributors
    slug: v.optional(v.string()),
    // Amazon author IDs extracted from byline links - used for linking to authors table
    amazonAuthorIds: v.optional(v.array(v.string())), // Kept for backward compatibility - derived from contributors
    // Contributors with roles (Author, Illustrator, etc.)
    contributors: v.optional(
      v.array(
        v.object({
          name: v.string(),
          amazonAuthorId: v.optional(v.string()),
          role: v.string(), // 'author' | 'illustrator' | 'editor' | 'translator' | 'narrator' | 'other'
        }),
      ),
    ),

    // Identifiers
    asin: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),
    // Note: ISBNs are stored on bookEditions table, joined via primaryEditionId

    // Available formats (extracted from "See all formats" section)
    formats: v.optional(
      v.array(
        v.object({
          type: v.string(), // 'hardcover', 'paperback', 'kindle', 'audiobook', etc.
          asin: v.string(),
          amazonUrl: v.string(),
        }),
      ),
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

    // Cover image - nested structure (new format)
    // Contains all cover-related data in one object for cleaner organization
    cover: v.optional(
      v.object({
        // Source info (where we scraped the cover from)
        sourceUrl: v.optional(v.string()),
        sourceAsin: v.optional(v.string()),
        sourceFormat: v.optional(v.string()), // 'kindle' | 'hardcover' | 'paperback'

        // Dimensions (of the source image)
        width: v.optional(v.number()),
        height: v.optional(v.number()),

        // Storage IDs (our processed images at different resolutions)
        storageIdThumb: v.optional(v.id('_storage')), // ~100px for small grids
        storageIdMedium: v.optional(v.id('_storage')), // ~522px for cards
        storageIdFull: v.optional(v.id('_storage')), // ~1500px for detail pages

        // UX helpers
        blurHash: v.optional(v.string()),
        dominantColor: v.optional(v.string()), // hex color like "#a4c2e8"
      }),
    ),

    // Reading level
    lexileScore: v.optional(v.number()),
    // Age range as numeric min/max for easy filtering
    ageRangeMin: v.optional(v.number()), // e.g., 4
    ageRangeMax: v.optional(v.number()), // e.g., 8
    // DEPRECATED: Old string format, kept during migration
    ageRange: v.optional(v.string()),
    // Grade level as numeric min/max for easy filtering
    gradeLevelMin: v.optional(v.number()), // -1=PreK, 0=K, 1-12=grades
    gradeLevelMax: v.optional(v.number()),
    // DEPRECATED: Old string format, kept during migration
    gradeLevel: v.optional(v.string()),

    // Metadata
    source: v.string(), // 'amazon', 'openlibrary', etc.
    // Search - denormalized field for full-text search (title + subtitle + authors + identifiers)
    searchText: v.optional(v.string()),
    // Scrape version - tracks which version of the scraping logic produced this data
    // Used to identify entities that should be re-scraped when parsing improves
    scrapeVersion: v.optional(v.number()),
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
    scrapeStatus: v.optional(v.union(v.literal('pending'), v.literal('complete'), v.literal('error'))),
    coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    scrapedAt: v.number(),
    errorMessage: v.optional(v.string()),

    // Bad scrape tracking - for flagging entities that need re-scraping
    badScrape: v.optional(v.boolean()),
    badScrapeNotes: v.optional(v.string()),
    badScrapeMarkedAt: v.optional(v.number()),
    // Provenance tracking - where this entity was first discovered
    firstSeenFromUrl: v.optional(v.string()), // Set once on initial import
    firstSeenReason: v.optional(v.string()),

    // Primary edition - points to the "main" bookEditions record (the one we scraped)
    // When multi-source is added, this indicates which edition provides canonical data
    primaryEditionId: v.optional(v.id('bookEditions')),

    // Ratings (scraped, never displayed - used only for sorting)
    amazonRatingAverage: v.optional(v.number()), // 0-5
    amazonRatingCount: v.optional(v.number()), // integer
    goodreadsRatingAverage: v.optional(v.number()), // 0-5
    goodreadsRatingCount: v.optional(v.number()), // integer
    ratingScore: v.optional(v.number()), // 0-5, computed blend
  })
    .index('by_detailsStatus', ['detailsStatus'])
    .index('by_coverStatus', ['coverStatus'])
    .index('by_asin', ['asin'])
    .index('by_seriesId', ['seriesId'])
    .index('by_badScrape', ['badScrape'])
    .index('by_slug', ['slug'])
    .index('by_ratingScore', ['ratingScore'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: [],
    }),

  // ===================
  // BOOK EDITIONS (one row per format/source)
  // ===================

  bookEditions: defineTable({
    bookId: v.id('books'),

    // Source info
    source: v.string(), // 'amazon' | 'goodreads' | 'bookshop' | etc.
    sourceId: v.string(), // Amazon ASIN, provider-specific ID
    sourceUrl: v.string(), // URL to this edition

    // Format
    format: v.string(), // 'hardcover' | 'paperback' | 'kindle' | 'audiobook' | 'board_book' | etc.

    // Identifiers for this specific edition
    isbn10: v.optional(v.string()),
    isbn13: v.optional(v.string()),

    // Cover for this edition
    mainCoverUrl: v.optional(v.string()), // Main cover URL from this edition page

    // Publisher for this edition
    publisherId: v.optional(v.id('publishers')),

    // Meta
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_bookId', ['bookId']) // List all editions for a book
    .index('by_source_sourceId', ['source', 'sourceId']) // Fast lookup by ASIN / provider ID
    .index('by_isbn13', ['isbn13']) // Lookup by ISBN-13
    .index('by_publisherId', ['publisherId']), // For "books by publisher" queries

  // ===================
  // BOOK IDENTIFIERS (fast "any identifier" lookup)
  // ===================

  bookIdentifiers: defineTable({
    bookId: v.id('books'),

    // Identifier
    type: v.union(v.literal('asin'), v.literal('isbn10'), v.literal('isbn13')),
    value: v.string(), // Normalized: strip hyphens, uppercase ASIN

    // Provenance
    editionId: v.optional(v.id('bookEditions')), // Where we found it
    source: v.optional(v.string()), // 'amazon' | 'goodreads' | etc.
    sourceUrl: v.optional(v.string()), // Page where it was discovered

    // Meta
    firstSeenAt: v.number(),
  })
    .index('by_type_value', ['type', 'value']) // Main lookup path - find book by any identifier
    .index('by_bookId', ['bookId']), // List all identifiers for a book (admin/debug)

  // ===================
  // BOOK COVER CANDIDATES (enables "pick best cover" admin flow)
  // ===================

  bookCoverCandidates: defineTable({
    bookId: v.id('books'),
    editionId: v.optional(v.id('bookEditions')), // Which edition this came from

    // Image info
    imageUrl: v.string(), // The cover URL
    width: v.optional(v.number()), // From data-a-dynamic-image or provider metadata
    height: v.optional(v.number()),

    // Source
    source: v.string(), // 'amazon' | 'goodreads' | etc.
    sourceUrl: v.optional(v.string()), // Page where it was found

    // QA fields (for future use)
    isPrimary: v.optional(v.boolean()), // Was this the primary cover on the page?
    badReason: v.optional(v.string()), // If flagged as bad: 'too_small' | 'wrong_aspect' | etc.

    // Meta
    createdAt: v.number(),
  })
    .index('by_bookId', ['bookId']) // Admin UI lists candidates quickly
    .index('by_bookId_imageUrl', ['bookId', 'imageUrl']), // For upsert deduplication

  // ===================
  // SERIES
  // ===================

  series: defineTable({
    // Identity
    name: v.string(),
    slug: v.optional(v.string()),

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

    // Scrape version - tracks which version of the scraping logic produced this data
    scrapeVersion: v.optional(v.number()),

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

    // Bad scrape tracking - for flagging entities that need re-scraping
    badScrape: v.optional(v.boolean()),
    badScrapeNotes: v.optional(v.string()),
    badScrapeMarkedAt: v.optional(v.number()),
    // Provenance tracking - where this entity was first discovered
    firstSeenFromUrl: v.optional(v.string()), // Set once on initial import
    firstSeenReason: v.optional(v.string()),

    // Meta
    createdAt: v.number(),
  })
    .index('by_sourceId', ['sourceId'])
    .index('by_sourceUrl', ['sourceUrl'])
    .index('by_scrapeStatus', ['scrapeStatus'])
    .index('by_name', ['name'])
    .index('by_badScrape', ['badScrape'])
    .index('by_slug', ['slug'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: [],
    }),

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
    slug: v.optional(v.string()),

    // Source - amazonAuthorId is the PRIMARY key for linking
    source: v.string(), // 'amazon'
    amazonAuthorId: v.string(), // e.g., 'B000APEZHY' - required, unique
    sourceUrl: v.optional(v.string()),

    // Image
    image: v.optional(
      v.object({
        sourceImageUrl: v.optional(v.string()),
        storageIdThumb: v.optional(v.id('_storage')), // 36px
        storageIdMedium: v.optional(v.id('_storage')), // 150px
        storageIdLarge: v.optional(v.id('_storage')), // 400px
      }),
    ),
    // DEPRECATED: Old image fields kept for backward compatibility during migration
    imageSourceUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),

    // Scrape version - tracks which version of the scraping logic produced this data
    scrapeVersion: v.optional(v.number()),

    // Status
    scrapeStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    lastScrapedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),

    // Bad scrape tracking - for flagging entities that need re-scraping
    badScrape: v.optional(v.boolean()),
    badScrapeNotes: v.optional(v.string()),
    badScrapeMarkedAt: v.optional(v.number()),
    // Provenance tracking - where this entity was first discovered
    firstSeenFromUrl: v.optional(v.string()), // Set once on initial import
    firstSeenReason: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index('by_amazonAuthorId', ['amazonAuthorId'])
    .index('by_name', ['name'])
    .index('by_scrapeStatus', ['scrapeStatus'])
    .index('by_badScrape', ['badScrape'])
    .index('by_slug', ['slug'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: [],
    }),

  // ===================
  // PUBLISHERS
  // ===================

  publishers: defineTable({
    // Identity
    name: v.string(),
    nameNormalized: v.string(), // Lowercase for case-insensitive indexed lookup
    slug: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_nameNormalized', ['nameNormalized']) // Fast case-insensitive lookup
    .index('by_slug', ['slug'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: [],
    }),

  // Join table for book-author relationships (enables indexed "books by author" queries)
  bookAuthors: defineTable({
    bookId: v.id('books'),
    authorId: v.id('authors'),

    // How the link was established
    source: v.string(), // 'amazonAuthorId' | 'nameMatch'

    // Contributor role (Author, Illustrator, etc.)
    role: v.optional(
      v.union(
        v.literal('author'),
        v.literal('illustrator'),
        v.literal('editor'),
        v.literal('translator'),
        v.literal('narrator'),
        v.literal('other'),
      ),
    ),

    createdAt: v.number(),
  })
    .index('by_authorId', ['authorId']) // Critical: "all books by author X"
    .index('by_bookId', ['bookId']) // "all authors of book Y"
    .index('by_bookId_authorId', ['bookId', 'authorId']), // Uniqueness check

  // ===================
  // AWARDS
  // ===================

  awards: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    slug: v.optional(v.string()),

    // Image
    imageStorageId: v.optional(v.id('_storage')),
    imageSourceUrl: v.optional(v.string()),

    createdAt: v.number(),
  })
    .index('by_name', ['name'])
    .index('by_slug', ['slug']),

  // Join table for book-award relationships
  bookAwards: defineTable({
    bookId: v.id('books'),
    awardId: v.id('awards'),

    // Award details for this specific book
    year: v.optional(v.number()),
    category: v.optional(v.string()), // e.g., "Winner", "Honor Book", "Finalist"

    createdAt: v.number(),
  })
    .index('by_bookId', ['bookId'])
    .index('by_awardId', ['awardId'])
    .index('by_bookId_awardId', ['bookId', 'awardId']), // Uniqueness check
})
