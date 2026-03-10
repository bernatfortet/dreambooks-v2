import { query, internalQuery } from '../_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { Id, Doc } from '../_generated/dataModel'
import { resolveBookCoverUrls } from '../lib/bookCoverUrls'

/**
 * Get cover dimensions from nested cover object.
 */
function getCoverDimensions(book: Doc<'books'>): { coverWidth: number | undefined; coverHeight: number | undefined } {
  return {
    coverWidth: book.cover?.width,
    coverHeight: book.cover?.height,
  }
}

export const list = query({
  handler: async (context) => {
    const books = await context.db.query('books').order('desc').collect()

    // Resolve cover URLs for all books
    const booksWithUrls = await Promise.all(
      books.map(async (book) => {
        const { coverUrl, coverUrlThumb } = await resolveBookCoverUrls(context.storage, book)
        return { ...book, coverUrl, coverUrlThumb }
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
    const paginatedResult = await context.db.query('books').order('desc').paginate(args.paginationOpts)

    const booksWithUrls = await Promise.all(
      paginatedResult.page.map(async (book) => {
        const { coverUrl, coverUrlThumb } = await resolveBookCoverUrls(context.storage, book)
        return { ...book, coverUrl, coverUrlThumb }
      }),
    )

    return {
      ...paginatedResult,
      page: booksWithUrls,
    }
  },
})

// Standard age range buckets for filtering
const AGE_RANGE_BUCKETS = [
  { id: '0-3', label: '0-3 years', min: 0, max: 3 },
  { id: '4-8', label: '4-8 years', min: 4, max: 8 },
  { id: '9-12', label: '9-12 years', min: 9, max: 12 },
  { id: '13+', label: '13+ years', min: 13, max: 18 },
] as const

// Standard grade level buckets for filtering
const GRADE_LEVEL_BUCKETS = [
  { id: 'prek', label: 'Pre-K', min: -1, max: -1 },
  { id: 'k-2', label: 'K-2', min: 0, max: 2 },
  { id: '3-5', label: '3-5', min: 3, max: 5 },
  { id: '6-8', label: '6-8', min: 6, max: 8 },
  { id: '9-12', label: '9-12', min: 9, max: 12 },
] as const

/**
 * Check if a book's age range overlaps with a filter bucket.
 */
function ageRangeOverlaps(bookMin: number, bookMax: number, bucketMin: number, bucketMax: number): boolean {
  return bookMin <= bucketMax && bookMax >= bucketMin
}

/**
 * Check if a book's grade level overlaps with a filter bucket.
 */
function gradeLevelOverlaps(bookMin: number, bookMax: number, bucketMin: number, bucketMax: number): boolean {
  return bookMin <= bucketMax && bookMax >= bucketMin
}

export const listPaginatedWithFilters = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filters: v.optional(
      v.object({
        // Age range filter using bucket IDs (e.g., '0-3', '4-8')
        ageRangeBuckets: v.optional(v.array(v.string())),
        // Grade level filter using bucket IDs (e.g., 'prek', 'k-2', '3-5')
        gradeLevelBuckets: v.optional(v.array(v.string())),
        awardIds: v.optional(v.array(v.id('awards'))),
        seriesFilter: v.optional(v.union(v.literal('all'), v.literal('with-series'), v.literal('standalone'))),
      }),
    ),
  },
  handler: async (context, args) => {
    const filters = args.filters || {}
    let allBooks = await context.db.query('books').order('desc').collect()

    // Filter by series
    if (filters.seriesFilter === 'with-series') {
      allBooks = allBooks.filter((book) => book.seriesId !== undefined)
    } else if (filters.seriesFilter === 'standalone') {
      allBooks = allBooks.filter((book) => book.seriesId === undefined)
    }

    // Filter by age range buckets (using numeric fields)
    if (filters.ageRangeBuckets && filters.ageRangeBuckets.length > 0) {
      // Get the bucket definitions for selected IDs
      const selectedBuckets = AGE_RANGE_BUCKETS.filter((b) => filters.ageRangeBuckets!.includes(b.id))

      allBooks = allBooks.filter((book) => {
        // Book must have numeric age range fields
        if (book.ageRangeMin === undefined || book.ageRangeMax === undefined) {
          return false
        }

        // Check if book overlaps with any selected bucket
        return selectedBuckets.some((bucket) => ageRangeOverlaps(book.ageRangeMin!, book.ageRangeMax!, bucket.min, bucket.max))
      })
    }

    // Filter by grade level buckets (using numeric fields)
    if (filters.gradeLevelBuckets && filters.gradeLevelBuckets.length > 0) {
      // Get the bucket definitions for selected IDs
      const selectedBuckets = GRADE_LEVEL_BUCKETS.filter((b) => filters.gradeLevelBuckets!.includes(b.id))

      allBooks = allBooks.filter((book) => {
        // Book must have numeric grade level fields
        if (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined) {
          return false
        }

        // Check if book overlaps with any selected bucket
        return selectedBuckets.some((bucket) => gradeLevelOverlaps(book.gradeLevelMin!, book.gradeLevelMax!, bucket.min, bucket.max))
      })
    }

    // Filter by awards (requires join table lookup)
    if (filters.awardIds && filters.awardIds.length > 0) {
      const bookIdsWithAwards = new Set<string>()

      // Get all bookAwards entries for the specified awards
      for (const awardId of filters.awardIds) {
        const bookAwardLinks = await context.db
          .query('bookAwards')
          .withIndex('by_awardId', (q) => q.eq('awardId', awardId))
          .collect()

        for (const link of bookAwardLinks) {
          bookIdsWithAwards.add(link.bookId)
        }
      }

      allBooks = allBooks.filter((book) => bookIdsWithAwards.has(book._id))
    }

    // Apply pagination manually
    // Find start index based on cursor
    let startIndex = 0
    if (args.paginationOpts.cursor) {
      const cursorIndex = allBooks.findIndex((book) => book._id === args.paginationOpts.cursor)
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1
      }
    }

    const numItems = args.paginationOpts.numItems
    const endIndex = startIndex + numItems
    const page = allBooks.slice(startIndex, endIndex)

    // Resolve cover URLs
    const booksWithUrls = await Promise.all(
      page.map(async (book) => {
        const { coverUrl, coverUrlThumb } = await resolveBookCoverUrls(context.storage, book)
        return { ...book, coverUrl, coverUrlThumb }
      }),
    )

    const isDone = endIndex >= allBooks.length
    const lastBook = page[page.length - 1]
    const continueCursor = !isDone && lastBook ? lastBook._id : null

    return {
      page: booksWithUrls,
      isDone,
      continueCursor,
    }
  },
})

/**
 * Optimized query for book grids - returns only essential fields.
 * Use this for list views to minimize data transfer.
 */
export const listForGrid = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('books'),
        title: v.string(),
        slug: v.union(v.string(), v.null()),
        authors: v.array(v.string()),
        seriesPosition: v.union(v.number(), v.null()),
        coverUrl: v.union(v.string(), v.null()),
        coverUrlThumb: v.union(v.string(), v.null()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (context, args) => {
    const result = await context.db.query('books').order('desc').paginate(args.paginationOpts)

    const page = await Promise.all(
      result.page.map(async (book) => {
        const { coverUrl, coverUrlThumb } = await resolveBookCoverUrls(context.storage, book)

        return {
          _id: book._id,
          title: book.title,
          slug: book.slug ?? null,
          authors: book.authors,
          seriesPosition: book.seriesPosition ?? null,
          coverUrl,
          coverUrlThumb,
        }
      }),
    )

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor ?? null,
    }
  },
})

export const get = query({
  args: { id: v.id('books') },
  handler: async (context, args) => {
    const book = (await context.db.get(args.id)) as Doc<'books'> | null
    if (!book) return null

    const { coverUrl, coverUrlThumb, coverUrlFull } = await resolveBookCoverUrls(context.storage, book)
    const { coverWidth, coverHeight } = getCoverDimensions(book)

    // Include series info if book is linked to a series
    let seriesInfo = null
    if (book.seriesId) {
      const series = (await context.db.get(book.seriesId)) as Doc<'series'> | null
      if (series) {
        seriesInfo = {
          _id: series._id,
          name: series.name,
          slug: series.slug,
          sourceUrl: series.sourceUrl,
          scrapeStatus: series.scrapeStatus,
        }
      }
    }

    return { ...book, coverUrl, coverUrlThumb, coverUrlFull, coverWidth, coverHeight, seriesInfo }
  },
})

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (context, args) => {
    const book = await context.db
      .query('books')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!book) return null

    // Join primary edition for Amazon link (1 extra read)
    const primaryEdition = book.primaryEditionId ? await context.db.get(book.primaryEditionId) : null

    const { coverUrl, coverUrlThumb, coverUrlFull } = await resolveBookCoverUrls(context.storage, book)
    const { coverWidth, coverHeight } = getCoverDimensions(book)

    // Include series info if book is linked to a series
    let seriesInfo = null
    if (book.seriesId) {
      const series = await context.db.get(book.seriesId)
      if (series) {
        seriesInfo = {
          _id: series._id,
          name: series.name,
          slug: series.slug,
          sourceUrl: series.sourceUrl,
          scrapeStatus: series.scrapeStatus,
        }
      }
    }

    // Derive Amazon URL from edition, fallback to book field
    const amazonUrl = primaryEdition?.source === 'amazon' ? primaryEdition.sourceUrl : book.amazonUrl

    return { ...book, coverUrl, coverUrlThumb, coverUrlFull, coverWidth, coverHeight, seriesInfo, amazonUrl }
  },
})

export const getBySlugOrId = query({
  args: { slugOrId: v.string() },
  handler: async (context, args) => {
    // Helper to get cover URLs and series info
    const enrichBook = async (book: Doc<'books'>) => {
      const { coverUrl, coverUrlThumb, coverUrlFull } = await resolveBookCoverUrls(context.storage, book)
      const { coverWidth, coverHeight } = getCoverDimensions(book)

      let seriesInfo = null
      if (book.seriesId) {
        const series = (await context.db.get(book.seriesId)) as Doc<'series'> | null
        if (series) {
          seriesInfo = {
            _id: series._id,
            name: series.name,
            slug: series.slug,
            sourceUrl: series.sourceUrl,
            scrapeStatus: series.scrapeStatus,
          }
        }
      }

      return { ...book, coverUrl, coverUrlThumb, coverUrlFull, coverWidth, coverHeight, seriesInfo }
    }

    // Try slug first
    const bySlug = await context.db
      .query('books')
      .withIndex('by_slug', (q) => q.eq('slug', args.slugOrId))
      .first()
    if (bySlug) {
      return enrichBook(bySlug)
    }

    // Fall back to id lookup
    try {
      const byId = (await context.db.get(args.slugOrId as Id<'books'>)) as Doc<'books'> | null
      if (byId) {
        return enrichBook(byId)
      }
    } catch {
      // Invalid id format, return null
    }

    return null
  },
})

/**
 * Get available filter options from the database.
 * Returns predefined age range buckets and grade level buckets with counts.
 */
export const getFilterOptions = query({
  returns: v.object({
    ageRangeBuckets: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        min: v.number(),
        max: v.number(),
        count: v.number(),
      }),
    ),
    gradeLevelBuckets: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        min: v.number(),
        max: v.number(),
        count: v.number(),
      }),
    ),
    ageRanges: v.array(v.string()),
    gradeLevels: v.array(v.string()),
  }),
  handler: async (context) => {
    const books = await context.db.query('books').collect()

    // Calculate counts for each age range bucket
    const ageRangeBuckets = AGE_RANGE_BUCKETS.map((bucket) => {
      const count = books.filter((book) => {
        if (book.ageRangeMin === undefined || book.ageRangeMax === undefined) {
          return false
        }
        return ageRangeOverlaps(book.ageRangeMin, book.ageRangeMax, bucket.min, bucket.max)
      }).length

      return {
        id: bucket.id,
        label: bucket.label,
        min: bucket.min,
        max: bucket.max,
        count,
      }
    })

    // Calculate counts for each grade level bucket
    const gradeLevelBuckets = GRADE_LEVEL_BUCKETS.map((bucket) => {
      const count = books.filter((book) => {
        if (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined) {
          return false
        }
        return gradeLevelOverlaps(book.gradeLevelMin, book.gradeLevelMax, bucket.min, bucket.max)
      }).length

      return {
        id: bucket.id,
        label: bucket.label,
        min: bucket.min,
        max: bucket.max,
        count,
      }
    })

    // Extract unique grade levels (for backward compat during transition)
    const gradeLevels = [...new Set(books.map((book) => book.gradeLevel).filter(Boolean))] as string[]

    return {
      ageRangeBuckets,
      gradeLevelBuckets,
      // Keep old fields for backward compat during transition (can remove later)
      ageRanges: ageRangeBuckets.filter((b) => b.count > 0).map((b) => b.label),
      gradeLevels: gradeLevels.sort(),
    }
  },
})

// Internal query for use in actions (no URL resolution needed)
export const getInternal = internalQuery({
  args: { id: v.id('books') },
  handler: async (context, args) => {
    const book = (await context.db.get(args.id)) as Doc<'books'> | null

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
 * Returns true if book has no cover storage ID and coverStatus is not 'complete'.
 * @deprecated Use coverSourceUrlChanged from createOrUpdate result instead
 */
export const needsCoverDownload = internalQuery({
  args: { bookId: v.id('books') },
  returns: v.boolean(),
  handler: async (context, args) => {
    const book = (await context.db.get(args.bookId)) as Doc<'books'> | null
    if (!book) return false

    const hasCoverStorage = book.cover?.storageIdMedium
    return !hasCoverStorage && book.coverStatus !== 'complete'
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
    }),
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

/**
 * List books with outdated scrape versions (for automatic re-scraping).
 * Returns books that have amazonUrl and scrapeVersion < currentVersion.
 */
export const listOutdatedVersions = query({
  args: {
    currentVersion: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('books'),
      title: v.string(),
      amazonUrl: v.string(),
      scrapeVersion: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (context, args) => {
    const limit = args.limit ?? 10

    // Get all books with an amazonUrl (required for re-scraping)
    const allBooks = await context.db.query('books').collect()

    return allBooks
      .filter((b) => {
        // Must have a URL to scrape
        if (!b.amazonUrl) return false
        // Include if no version (never scraped) or version is outdated
        return b.scrapeVersion === undefined || b.scrapeVersion < args.currentVersion
      })
      .slice(0, limit)
      .map((b) => ({
        _id: b._id,
        title: b.title,
        amazonUrl: b.amazonUrl!,
        scrapeVersion: b.scrapeVersion ?? null,
      }))
  },
})
