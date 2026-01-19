import { internalMutation, mutation, MutationCtx } from '../_generated/server'
import { Id } from '../_generated/dataModel'
import { DatabaseReader, DatabaseWriter } from '../_generated/server'
import { v } from 'convex/values'
import { extractSeriesId, normalizeAmazonUrl } from '../scraping/adapters/amazon/url'
import { Doc } from '../_generated/dataModel'
import { internal } from '../_generated/api'

// Type for book entry in series scrape
type SeriesBookEntry = {
  title: string
  amazonUrl: string
  asin?: string
  position?: number
  coverImageUrl?: string
  authors?: string[]
}

/**
 * Find existing series by various identifiers.
 * Lookup order: sourceId > sourceUrl > name (case-insensitive)
 */
async function findExistingSeriesByIdentifiers(
  db: DatabaseReader,
  params: {
    sourceId?: string
    sourceUrl?: string
    name: string
  }
): Promise<Doc<'series'> | null> {
  const { sourceId, sourceUrl, name } = params

  // Try by sourceId first (most reliable)
  if (sourceId) {
    const existingBySourceId = await db
      .query('series')
      .withIndex('by_sourceId', (query) => query.eq('sourceId', sourceId))
      .unique()

    if (existingBySourceId) {
      console.log('💾 Found series by sourceId', { sourceId, seriesId: existingBySourceId._id })
      return existingBySourceId
    }
  }

  // Try by normalized sourceUrl
  if (sourceUrl) {
    const normalizedUrl = normalizeAmazonUrl(sourceUrl)
    const existingByUrl = await db
      .query('series')
      .withIndex('by_sourceUrl', (query) => query.eq('sourceUrl', normalizedUrl))
      .unique()

    if (existingByUrl) {
      console.log('💾 Found series by sourceUrl', { sourceUrl: normalizedUrl, seriesId: existingByUrl._id })
      return existingByUrl
    }
  }

  // Try by normalized name (last resort)
  const normalizedName = name.toLowerCase().trim()
  const allSeries = await db.query('series').withIndex('by_name').collect()
  const existingByName = allSeries.find((series) => series.name.toLowerCase().trim() === normalizedName)

  if (existingByName) {
    console.log('💾 Found series by name', { name, seriesId: existingByName._id })
    return existingByName
  }

  return null
}

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

    const existingSeries = await findExistingSeriesByIdentifiers(context.db, {
      sourceId,
      sourceUrl: args.sourceUrl,
      name: args.name,
    })

    if (existingSeries) {
      // Update sourceUrl/sourceId if we have better data
      if (args.sourceUrl && !existingSeries.sourceUrl) {
        await context.db.patch(existingSeries._id, {
          sourceUrl: args.sourceUrl,
          sourceId,
        })
      }

      return existingSeries._id
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

// Blocklist for series names that are UI elements, not actual series names
const SERIES_NAME_BLOCKLIST = [
  'follow the author',
  'kindle edition',
  'paperback',
  'hardcover',
  'audiobook',
  'audible',
  'see all formats',
  'buy now',
  'add to cart',
  'shop now',
  'continue shopping',
]

function isValidSeriesName(name: string): boolean {
  const normalized = name.toLowerCase().trim()

  if (SERIES_NAME_BLOCKLIST.some((blocked) => normalized.includes(blocked))) {
    return false
  }

  if (normalized.length < 3) {
    return false
  }

  if (/^\d+$/.test(normalized)) {
    return false
  }

  return true
}

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
    const { seriesId, name, ...updates } = args

    // Only update name if it passes validation (prevent bad data from poisoning the series)
    let validatedName: string | undefined
    if (name && isValidSeriesName(name)) {
      validatedName = name
    } else if (name) {
      console.log('⚠️ Rejected invalid series name:', name)
    }

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
      ...(validatedName ? { name: validatedName } : {}),
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
    const patchData: { seriesId: Id<'series'>; seriesPosition?: number } = {
      seriesId: args.seriesId,
    }

    // Only update seriesPosition if provided (don't overwrite with undefined)
    if (args.seriesPosition !== undefined && args.seriesPosition !== null) {
      patchData.seriesPosition = args.seriesPosition
    }

    await context.db.patch(args.bookId, patchData)

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

/**
 * Mark a series as having an error during scraping.
 */
export const markError = mutation({
  args: {
    seriesId: v.id('series'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.seriesId, {
      scrapeStatus: 'error',
      errorMessage: args.errorMessage,
      lastAttemptedAt: Date.now(),
    })
    return null
  },
})

/**
 * Update series source URL (for manual entry in admin UI).
 */
export const updateSourceUrl = mutation({
  args: {
    seriesId: v.id('series'),
    sourceUrl: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const series = await context.db.get(args.seriesId)

    if (!series) {
      throw new Error('Series not found')
    }

    const sourceId = extractSeriesId(args.sourceUrl) ?? undefined
    const normalizedUrl = normalizeAmazonUrl(args.sourceUrl)

    console.log('💾 Updating series sourceUrl', {
      seriesId: args.seriesId,
      sourceUrl: normalizedUrl,
      sourceId,
    })

    await context.db.patch(args.seriesId, {
      sourceUrl: normalizedUrl,
      sourceId,
    })

    return null
  },
})

/**
 * Create a series from a book's series info and link the book to it.
 * Public mutation for admin UI.
 */
export const createFromBook = mutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.id('series'),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)

    if (!book) {
      throw new Error('Book not found')
    }

    if (!book.seriesName) {
      throw new Error('Book has no series name')
    }

    if (book.seriesId) {
      throw new Error('Book already linked to a series')
    }

    // Extract identifiers from book's series info
    const sourceUrl = book.seriesUrl ?? undefined
    let sourceId: string | undefined

    if (sourceUrl) {
      sourceId = extractSeriesId(sourceUrl) ?? undefined
    }

    // Find or create series using shared helper
    const existingSeries = await findExistingSeriesByIdentifiers(context.db, {
      sourceId,
      sourceUrl,
      name: book.seriesName,
    })

    let seriesId: Id<'series'>

    if (existingSeries) {
      seriesId = existingSeries._id

      // Update sourceUrl if we have it and series doesn't
      if (sourceUrl && !existingSeries.sourceUrl) {
        await context.db.patch(existingSeries._id, {
          sourceUrl,
          sourceId,
        })
      }
    } else {
      console.log('💾 Creating new series from book', { name: book.seriesName })

      seriesId = await context.db.insert('series', {
        name: book.seriesName,
        source: 'amazon',
        sourceUrl,
        sourceId,
        completeness: 'unknown',
        scrapeStatus: 'pending',
        createdAt: Date.now(),
      })
    }

    // Link the book to the series
    await context.db.patch(args.bookId, {
      seriesId,
    })

    // Update series scraped book count
    const booksInSeries = await context.db
      .query('books')
      .withIndex('by_seriesId', (query) => query.eq('seriesId', seriesId))
      .collect()

    await context.db.patch(seriesId, {
      scrapedBookCount: booksInSeries.length,
    })

    return seriesId
  },
})

/**
 * Upsert a series from a URL (public mutation for CLI/scripts).
 */
export const upsertFromUrl = mutation({
  args: {
    name: v.string(),
    sourceUrl: v.string(),
    description: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
  },
  returns: v.id('series'),
  handler: async (context, args) => {
    const sourceId = extractSeriesId(args.sourceUrl) ?? undefined
    const normalizedUrl = normalizeAmazonUrl(args.sourceUrl)

    const existingSeries = await findExistingSeriesByIdentifiers(context.db, {
      sourceId,
      sourceUrl: normalizedUrl,
      name: args.name,
    })

    if (existingSeries) {
      // Update fields if we have better data
      const updates: Partial<Doc<'series'>> = {}
      if (normalizedUrl && !existingSeries.sourceUrl) {
        updates.sourceUrl = normalizedUrl
        updates.sourceId = sourceId
      }
      if (args.description && !existingSeries.description) {
        updates.description = args.description
      }
      if (args.coverImageUrl && !existingSeries.coverSourceUrl) {
        updates.coverSourceUrl = args.coverImageUrl
      }

      if (Object.keys(updates).length > 0) {
        await context.db.patch(existingSeries._id, updates)
      }

      return existingSeries._id
    }

    // Create new series
    console.log('💾 Creating new series from URL', { name: args.name, sourceId })

    const seriesId = await context.db.insert('series', {
      name: args.name,
      source: 'amazon',
      sourceUrl: normalizedUrl,
      sourceId,
      description: args.description,
      coverSourceUrl: args.coverImageUrl,
      completeness: 'unknown',
      scrapeStatus: 'pending',
      createdAt: Date.now(),
    })

    return seriesId
  },
})

/**
 * Public mutation to link a book to a series (wrapper for internal linkBook).
 */
export const linkBookToSeries = mutation({
  args: {
    bookId: v.id('books'),
    seriesId: v.id('series'),
    seriesPosition: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    const series = await context.db.get(args.seriesId)
    if (!series) {
      throw new Error('Series not found')
    }

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

    return null
  },
})

/**
 * Save series scrape results from CLI (Playwright runs locally, saves here).
 * Public mutation for CLI use - no Convex actions involved.
 */
export const saveFromCliScrape = mutation({
  args: {
    seriesId: v.id('series'),
    seriesName: v.string(),
    description: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    expectedBookCount: v.optional(v.number()),
    books: v.array(
      v.object({
        title: v.string(),
        amazonUrl: v.string(),
        asin: v.optional(v.string()),
        position: v.optional(v.number()),
        coverImageUrl: v.optional(v.string()),
        authors: v.optional(v.array(v.string())),
      })
    ),
    pagination: v.optional(
      v.object({
        currentPage: v.number(),
        totalPages: v.optional(v.number()),
        nextPageUrl: v.optional(v.string()),
      })
    ),
  },
  returns: v.object({
    booksFound: v.number(),
    pending: v.number(),
    skipped: v.number(),
    hasMorePages: v.boolean(),
  }),
  handler: async (context, args) => {
    console.log('💾 Saving CLI scrape results', { seriesId: args.seriesId, books: args.books.length })

    let pendingCount = 0
    let skippedCount = 0

    for (const book of args.books) {
      const result = await processBookFromSeriesScrape(context, {
        seriesId: args.seriesId,
        book,
      })

      if (result.status === 'created') {
        pendingCount++
        console.log(`  📚 ${book.title}`)
      } else {
        skippedCount++
        console.log(`  ⏭️ ${book.title}`)
      }
    }

    await updateSeriesAfterScrape(context.db, {
      seriesId: args.seriesId,
      seriesName: args.seriesName,
      description: args.description,
      coverImageUrl: args.coverImageUrl,
      expectedBookCount: args.expectedBookCount,
      booksFound: args.books.length,
      pagination: args.pagination,
    })

    console.log('✅ CLI scrape saved', { pending: pendingCount, skipped: skippedCount })

    return {
      booksFound: args.books.length,
      pending: pendingCount,
      skipped: skippedCount,
      hasMorePages: !!args.pagination?.nextPageUrl,
    }
  },
})

// Helper functions (ordered from higher-level to lower-level)

async function updateSeriesAfterScrape(
  db: DatabaseWriter,
  params: {
    seriesId: Id<'series'>
    seriesName: string
    description?: string
    coverImageUrl?: string
    expectedBookCount?: number
    booksFound: number
    pagination?: { currentPage: number; totalPages?: number; nextPageUrl?: string }
  }
) {
  const { seriesId, seriesName, description, coverImageUrl, expectedBookCount, booksFound, pagination } = params

  const validatedName = isValidSeriesName(seriesName) ? seriesName : undefined

  let completeness: 'unknown' | 'partial' | 'confident' = 'unknown'
  if (expectedBookCount !== undefined) {
    completeness = booksFound >= expectedBookCount ? 'confident' : 'partial'
  }

  let scrapeStatus: 'partial' | 'complete' = 'complete'
  if (pagination?.nextPageUrl) {
    scrapeStatus = 'partial'
  }

  await db.patch(seriesId, {
    ...(validatedName ? { name: validatedName } : {}),
    description,
    coverSourceUrl: coverImageUrl,
    expectedBookCount,
    discoveredBookCount: booksFound,
    completeness,
    scrapeStatus,
    lastScrapedAt: Date.now(),
    lastScrapedPage: pagination?.currentPage,
    totalPages: pagination?.totalPages,
    nextPageUrl: pagination?.nextPageUrl,
  })

  const booksInSeries = await db
    .query('books')
    .withIndex('by_seriesId', (query) => query.eq('seriesId', seriesId))
    .collect()

  await db.patch(seriesId, {
    scrapedBookCount: booksInSeries.length,
  })
}

async function createBasicBookFromSeriesEntry(
  db: DatabaseWriter,
  params: {
    seriesId: Id<'series'>
    book: {
      title: string
      amazonUrl: string
      asin?: string
      position?: number
      coverImageUrl?: string
      authors?: string[]
    }
  }
): Promise<Id<'books'>> {
  const { seriesId, book } = params

  // Clean title: remove series names in parentheses
  const cleanedTitle = book.title?.replace(/\s*\([^)]+\)\s*$/, '').trim() || book.title

  return await db.insert('books', {
    title: cleanedTitle,
    authors: book.authors ?? [],
    asin: book.asin,
    amazonUrl: book.amazonUrl,
    seriesId,
    coverSourceUrl: book.coverImageUrl,
    source: 'amazon',
    detailsStatus: 'basic',
    coverStatus: book.coverImageUrl ? 'pending' : 'error',
    scrapedAt: Date.now(),
    // Only include seriesPosition if it's actually a number
    ...(book.position != null && { seriesPosition: book.position }),
  })
}

async function linkBookToSeriesIfNeeded(
  db: DatabaseWriter,
  params: {
    bookId: Id<'books'>
    seriesId: Id<'series'>
    position?: number
  }
) {
  const { bookId, seriesId, position } = params

  const book = await db.get(bookId)
  if (book && !book.seriesId) {
    await db.patch(bookId, {
      seriesId,
      seriesPosition: position,
    })
  }
}

async function findExistingBookByAsin(db: DatabaseReader, asin?: string) {
  if (!asin) return null

  const book = await db
    .query('books')
    .withIndex('by_asin', (query) => query.eq('asin', asin))
    .unique()

  return book
}

/**
 * Find existing book by title within a series.
 * Used as fallback when ASIN doesn't match (different editions have different ASINs).
 */
async function findExistingBookByTitleInSeries(
  db: DatabaseReader,
  params: { title: string; seriesId: Id<'series'> }
) {
  const { title, seriesId } = params

  // Get all books in the series
  const booksInSeries = await db
    .query('books')
    .withIndex('by_seriesId', (query) => query.eq('seriesId', seriesId))
    .collect()

  // Normalize title for comparison (lowercase, remove extra whitespace)
  const normalizeTitle = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim()
  const normalizedSearchTitle = normalizeTitle(title)

  // Find a book with matching title
  const matchingBook = booksInSeries.find((book) => {
    const normalizedBookTitle = normalizeTitle(book.title)
    return normalizedBookTitle === normalizedSearchTitle
  })

  return matchingBook ?? null
}

/**
 * Process a single book from a series scrape.
 * Handles deduplication, creation, and cover download scheduling.
 */
async function processBookFromSeriesScrape(
  context: MutationCtx,
  params: { seriesId: Id<'series'>; book: SeriesBookEntry }
): Promise<{ status: 'created' | 'skipped'; bookId?: Id<'books'> }> {
  const { seriesId, book } = params

  // Check for existing book by ASIN first
  let existingBook = await findExistingBookByAsin(context.db, book.asin)

  // Fallback: check by title within the series
  if (!existingBook) {
    existingBook = await findExistingBookByTitleInSeries(context.db, {
      title: book.title,
      seriesId,
    })
  }

  if (existingBook) {
    await linkBookToSeriesIfNeeded(context.db, {
      bookId: existingBook._id,
      seriesId,
      position: book.position,
    })

    return { status: 'skipped', bookId: existingBook._id }
  }

  // Create new book
  const bookId = await createBasicBookFromSeriesEntry(context.db, {
    seriesId,
    book,
  })

  // Schedule cover download if available
  if (book.coverImageUrl) {
    await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
      bookId,
      sourceUrl: book.coverImageUrl,
    })
  }

  return { status: 'created', bookId }
}

