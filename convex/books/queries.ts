import { query, internalQuery } from '../_generated/server'
import type { DatabaseReader } from '../_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { Id, Doc } from '../_generated/dataModel'
import { isBookVisibleForDiscovery } from '../lib/bookVisibility'

/**
 * Helper to resolve cover URLs from storage IDs and build enriched cover object.
 * Returns the full cover object with resolved URLs merged in.
 */
async function resolveCover(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  book: Doc<'books'>,
): Promise<{
  url: string | null
  urlThumb: string | null
  urlFull: string | null
  width: number
  height: number
  blurHash: string | null
  dominantColor: string | null
  sourceUrl: string | null
  sourceAsin: string | null
  sourceFormat: string | null
}> {
  const mediumId = book.cover?.storageIdMedium
  const thumbId = book.cover?.storageIdThumb
  const fullId = book.cover?.storageIdFull

  const url = mediumId ? await storage.getUrl(mediumId) : null
  const urlThumb = thumbId ? await storage.getUrl(thumbId) : url
  const urlFull = fullId ? await storage.getUrl(fullId) : url

  // Default to 2/3 aspect ratio (standard book cover) if dimensions missing
  const width = book.cover?.width && book.cover.width > 0 ? book.cover.width : 200
  const height = book.cover?.height && book.cover.height > 0 ? book.cover.height : 300

  return {
    url,
    urlThumb,
    urlFull,
    width,
    height,
    blurHash: book.cover?.blurHash ?? null,
    dominantColor: book.cover?.dominantColor ?? null,
    sourceUrl: book.cover?.sourceUrl ?? null,
    sourceAsin: book.cover?.sourceAsin ?? null,
    sourceFormat: book.cover?.sourceFormat ?? null,
  }
}

/**
 * Get linked authors for a book with their canonical names and slugs.
 */
async function getLinkedAuthors(
  db: DatabaseReader,
  bookId: Id<'books'>,
): Promise<Array<{ _id: Id<'authors'>; name: string; slug: string | undefined; amazonAuthorId: string; role: string | undefined }>> {
  const links = await db
    .query('bookAuthors')
    .withIndex('by_bookId', (q) => q.eq('bookId', bookId))
    .collect()

  const authorCache = new Map<Id<'authors'>, Doc<'authors'> | null>()

  const authors = await Promise.all(
    links.map(async (link) => {
      const cached = authorCache.get(link.authorId)
      if (cached !== undefined) {
        if (!cached) return null
        return {
          _id: cached._id,
          name: cached.name,
          slug: cached.slug,
          amazonAuthorId: cached.amazonAuthorId,
          role: link.role,
        }
      }

      const author = (await db.get(link.authorId)) as Doc<'authors'> | null
      authorCache.set(link.authorId, author)
      if (!author) return null
      return {
        _id: author._id,
        name: author.name,
        slug: author.slug,
        amazonAuthorId: author.amazonAuthorId,
        role: link.role,
      }
    }),
  )

  return authors.filter((author): author is NonNullable<typeof author> => author !== null)
}

function filterVisibleBooks<T extends Pick<Doc<'books'>, 'catalogStatus'>>(books: T[]): T[] {
  return books.filter((book) => isBookVisibleForDiscovery(book))
}

async function resolveBooksWithCovers(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  books: Doc<'books'>[],
) {
  return await Promise.all(
    books.map(async (book) => {
      const cover = await resolveCover(storage, book)
      return { ...book, cover }
    }),
  )
}

function sortBooksForDiscovery<T extends Pick<Doc<'books'>, 'ratingScore' | '_creationTime'>>(books: T[]) {
  books.sort((a, b) => {
    const scoreA = a.ratingScore ?? 0
    const scoreB = b.ratingScore ?? 0
    if (scoreB !== scoreA) return scoreB - scoreA
    return b._creationTime - a._creationTime
  })

  return books
}

function paginateCollectionPage<T extends { _id: string }>(
  items: T[],
  paginationOpts: { cursor: string | null; numItems: number },
) {
  let startIndex = 0

  if (paginationOpts.cursor) {
    const cursorIndex = items.findIndex((item) => item._id === paginationOpts.cursor)
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1
    }
  }

  const endIndex = startIndex + paginationOpts.numItems
  const page = items.slice(startIndex, endIndex)
  const isDone = endIndex >= items.length
  const lastItem = page[page.length - 1]
  const continueCursor = !isDone && lastItem ? lastItem._id : null

  return {
    continueCursor: continueCursor ?? '',
    isDone,
    page,
  }
}

async function getBookIdsWithAwards(
  db: DatabaseReader,
  awardIds: Id<'awards'>[],
) {
  const bookIdsWithAwards = new Set<string>()

  for (const awardId of awardIds) {
    const bookAwardLinks = await db
      .query('bookAwards')
      .withIndex('by_awardId', (q) => q.eq('awardId', awardId))
      .collect()

    for (const link of bookAwardLinks) {
      bookIdsWithAwards.add(link.bookId)
    }
  }

  return bookIdsWithAwards
}

type DiscoveryFilters = {
  ageRangeBuckets?: string[]
  gradeLevelBuckets?: string[]
  awardIds?: Id<'awards'>[]
  seriesFilter?: 'all' | 'with-series' | 'standalone'
}

async function filterBooksWithDiscoveryFilters(
  db: DatabaseReader,
  books: Doc<'books'>[],
  filters: DiscoveryFilters,
) {
  let filteredBooks = books

  if (filters.seriesFilter === 'with-series') {
    filteredBooks = filteredBooks.filter((book) => book.seriesId !== undefined)
  } else if (filters.seriesFilter === 'standalone') {
    filteredBooks = filteredBooks.filter((book) => book.seriesId === undefined)
  }

  if (filters.ageRangeBuckets?.length) {
    const selectedBuckets = AGE_RANGE_BUCKETS.filter((bucket) => filters.ageRangeBuckets?.includes(bucket.id))

    filteredBooks = filteredBooks.filter((book) => {
      if (book.ageRangeMin === undefined || book.ageRangeMax === undefined) {
        return false
      }

      return selectedBuckets.some((bucket) => ageRangeOverlaps(book.ageRangeMin!, book.ageRangeMax!, bucket.min, bucket.max))
    })
  }

  if (filters.gradeLevelBuckets?.length) {
    const selectedBuckets = GRADE_LEVEL_BUCKETS.filter((bucket) => filters.gradeLevelBuckets?.includes(bucket.id))

    filteredBooks = filteredBooks.filter((book) => {
      if (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined) {
        return false
      }

      return selectedBuckets.some((bucket) => gradeLevelOverlaps(book.gradeLevelMin!, book.gradeLevelMax!, bucket.min, bucket.max))
    })
  }

  if (filters.awardIds?.length) {
    const bookIdsWithAwards = await getBookIdsWithAwards(db, filters.awardIds)
    filteredBooks = filteredBooks.filter((book) => bookIdsWithAwards.has(book._id))
  }

  return filteredBooks
}

export const list = query({
  handler: async (context) => {
    const allBooks = await context.db.query('books').collect()
    const books = sortBooksForDiscovery(filterVisibleBooks(allBooks))
    const booksWithCovers = await resolveBooksWithCovers(context.storage, books)

    return booksWithCovers
  },
})

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (context, args) => {
    const paginatedResult = await context.db
      .query('books')
      .withIndex('by_ratingScore')
      .order('desc')
      .filter((q) => q.neq(q.field('catalogStatus'), 'hidden'))
      .paginate(args.paginationOpts)

    const booksWithCovers = await resolveBooksWithCovers(context.storage, paginatedResult.page)

    return {
      ...paginatedResult,
      page: booksWithCovers,
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
    const visibleBooks = filterVisibleBooks(await context.db.query('books').order('desc').collect())
    const allBooks = await filterBooksWithDiscoveryFilters(context.db, visibleBooks, filters)

    sortBooksForDiscovery(allBooks)

    const paginatedResult = paginateCollectionPage(allBooks, args.paginationOpts)
    const booksWithCovers = await resolveBooksWithCovers(context.storage, paginatedResult.page)

    return {
      continueCursor: paginatedResult.continueCursor,
      isDone: paginatedResult.isDone,
      page: booksWithCovers,
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
        cover: v.object({
          url: v.union(v.string(), v.null()),
          urlThumb: v.union(v.string(), v.null()),
        }),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (context, args) => {
    const result = await context.db
      .query('books')
      .withIndex('by_ratingScore')
      .order('desc')
      .filter((q) => q.neq(q.field('catalogStatus'), 'hidden'))
      .paginate(args.paginationOpts)

    const page = await Promise.all(
      result.page.map(async (book) => {
        const cover = await resolveCover(context.storage, book)

        return {
          _id: book._id,
          title: book.title,
          slug: book.slug ?? null,
          authors: book.authors,
          seriesPosition: book.seriesPosition ?? null,
          cover: {
            url: cover.url,
            urlThumb: cover.urlThumb,
          },
        }
      }),
    )

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor ?? '',
    }
  },
})

export const get = query({
  args: { id: v.id('books') },
  handler: async (context, args) => {
    const book = (await context.db.get(args.id)) as Doc<'books'> | null
    if (!book) return null

    const cover = await resolveCover(context.storage, book)

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
            expectedBookCount: series.expectedBookCount,
            discoveredBookCount: series.discoveredBookCount,
            scrapedBookCount: series.scrapedBookCount,
          }
        }
      }

      return { ...book, cover, seriesInfo }
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

    // Join primary edition for Amazon link and ISBNs (1 extra read)
    const primaryEdition = book.primaryEditionId ? await context.db.get(book.primaryEditionId) : null

    const cover = await resolveCover(context.storage, book)

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
          expectedBookCount: series.expectedBookCount,
          discoveredBookCount: series.discoveredBookCount,
          scrapedBookCount: series.scrapedBookCount,
        }
      }
    }

    // Derive Amazon URL from edition, fallback to book field
    const amazonUrl = primaryEdition?.source === 'amazon' ? primaryEdition.sourceUrl : book.amazonUrl

    // Join ISBNs from primary edition
    const isbn10 = primaryEdition?.isbn10 ?? null
    const isbn13 = primaryEdition?.isbn13 ?? null

    return { ...book, cover, seriesInfo, amazonUrl, isbn10, isbn13 }
  },
})

export const getBySlugOrId = query({
  args: { slugOrId: v.string() },
  handler: async (context, args) => {
    // Helper to get cover, series info, linked authors, and join primary edition data
    const enrichBook = async (book: Doc<'books'>) => {
      const cover = await resolveCover(context.storage, book)

      // Join primary edition for ISBNs
      const primaryEdition = book.primaryEditionId ? await context.db.get(book.primaryEditionId) : null

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
            expectedBookCount: series.expectedBookCount,
            discoveredBookCount: series.discoveredBookCount,
            scrapedBookCount: series.scrapedBookCount,
          }
        }
      }

      const linkedAuthors = await getLinkedAuthors(context.db, book._id)

      // Join ISBNs from primary edition
      const isbn10 = primaryEdition?.isbn10 ?? null
      const isbn13 = primaryEdition?.isbn13 ?? null

      return { ...book, cover, seriesInfo, linkedAuthors, isbn10, isbn13 }
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
    const books = filterVisibleBooks(await context.db.query('books').collect())

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
