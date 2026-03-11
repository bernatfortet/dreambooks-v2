import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { MutationCtx } from '../_generated/server'
import { buildSearchText } from './lib/searchText'
import { generateUniqueBookSlug } from '@/convex/lib/slug'
import { computeDiscoveryScore } from '@/lib/books/discovery-score'
import { getCoverFormatPriority, shouldReplaceStoredCover } from '@/lib/scraping/domains/book/preferred-cover'
import { internal } from '../_generated/api'

/**
 * Shared book fields validator for create/update operations.
 */
const bookFieldsValidator = {
  title: v.string(),
  subtitle: v.optional(v.string()),
  authors: v.array(v.string()),
  amazonAuthorIds: v.optional(v.array(v.string())),
  contributors: v.optional(
    v.array(
      v.object({
        name: v.string(),
        amazonAuthorId: v.optional(v.string()),
        role: v.string(),
      }),
    ),
  ),
  asin: v.optional(v.string()),
  amazonUrl: v.optional(v.string()),
  formats: v.optional(
    v.array(
      v.object({
        type: v.string(),
        asin: v.string(),
        amazonUrl: v.string(),
      }),
    ),
  ),
  seriesId: v.optional(v.id('series')),
  seriesName: v.optional(v.string()),
  seriesUrl: v.optional(v.string()),
  seriesPosition: v.optional(v.number()),
  publisher: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  description: v.optional(v.string()),
  // Cover source fields (used to build nested cover object)
  coverSourceUrl: v.optional(v.string()),
  coverWidth: v.optional(v.number()),
  coverHeight: v.optional(v.number()),
  coverSourceFormat: v.optional(v.string()),
  coverSourceAsin: v.optional(v.string()),
  lexileScore: v.optional(v.number()),
  // Age range - numeric for filtering
  ageRangeMin: v.optional(v.number()),
  ageRangeMax: v.optional(v.number()),
  // DEPRECATED: Old string format, kept during migration
  ageRange: v.optional(v.string()),
  // Grade level - numeric for filtering
  gradeLevelMin: v.optional(v.number()),
  gradeLevelMax: v.optional(v.number()),
  // DEPRECATED: Old string format, kept during migration
  gradeLevel: v.optional(v.string()),
  // Ratings (scraped, never displayed - used only for sorting)
  amazonRatingAverage: v.optional(v.number()),
  amazonRatingCount: v.optional(v.number()),
  goodreadsRatingAverage: v.optional(v.number()),
  goodreadsRatingCount: v.optional(v.number()),
  ratingScore: v.optional(v.number()),
  source: v.string(),
  // Scrape version - tracks which version of the scraping logic produced this data
  scrapeVersion: v.optional(v.number()),
}

/**
 * Clean title by removing series names in parentheses at the end.
 */
function cleanTitle(title: string): string {
  return title?.replace(/\s*\([^)]+\)\s*$/, '').trim() || title
}

/**
 * Decode common HTML entities in a string.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

/**
 * Normalize title for comparison (decode HTML entities, lowercase, collapse whitespace).
 */
function normalizeTitle(title: string): string {
  return decodeHtmlEntities(title).toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Unified book creation/update mutation.
 *
 * Deduplication order:
 * 1. ASIN (most reliable)
 * 2. Title within series (if seriesId provided)
 *
 * Note: ISBN lookup is handled via bookIdentifiers table (not stored on books table).
 *
 * Returns { bookId, isNew }
 */
export const createOrUpdate = internalMutation({
  args: {
    ...bookFieldsValidator,
    detailsStatus: v.union(v.literal('basic'), v.literal('queued'), v.literal('complete'), v.literal('error')),
    coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    firstSeenFromUrl: v.optional(v.string()),
    firstSeenReason: v.optional(v.string()),
    targetBookId: v.optional(v.id('books')),
  },
  returns: v.object({
    bookId: v.id('books'),
    isNew: v.boolean(),
    coverSourceUrlChanged: v.boolean(),
  }),
  handler: async (context, args) => {
    const cleanedTitle = cleanTitle(args.title)
    const normalizedTitle = normalizeTitle(cleanedTitle)

    // Log dedup attempt start
    console.log('🔍 Dedup check', {
      title: cleanedTitle,
      asin: args.asin ?? null,
      seriesId: args.seriesId ?? null,
      targetBookId: args.targetBookId ?? null,
    })

    if (args.targetBookId) {
      const existingByAsin = args.asin ? await findExistingBookByAsin(context, args.asin) : null
      if (existingByAsin && existingByAsin._id !== args.targetBookId) {
        throw new Error(`Target book re-scrape conflicts with existing book ${existingByAsin._id} for ASIN ${args.asin}`)
      }

      const { coverSourceUrlChanged } = await updateExistingBook(context, args.targetBookId, args, cleanedTitle)
      return { bookId: args.targetBookId, isNew: false, coverSourceUrlChanged }
    }

    // Try to find existing book by ASIN (most reliable)
    if (args.asin) {
      const existingByAsin = await findExistingBookByAsin(context, args.asin)

      if (existingByAsin) {
        console.log('✅ Dedup matched by ASIN', {
          asin: args.asin,
          existingId: existingByAsin._id,
          existingTitle: existingByAsin.title,
        })
        const { coverSourceUrlChanged } = await updateExistingBook(context, existingByAsin._id, args, cleanedTitle)
        return { bookId: existingByAsin._id, isNew: false, coverSourceUrlChanged }
      }
      console.log('   ASIN not found:', args.asin)
    }

    // Fallback: try title match within series
    if (args.seriesId) {
      const { match: existingByTitle, checkedTitles } = await findBookByTitleInSeriesWithLog(context, cleanedTitle, args.seriesId)

      if (existingByTitle) {
        console.log('✅ Dedup matched by title in series', {
          normalizedTitle,
          existingId: existingByTitle._id,
          existingTitle: existingByTitle.title,
        })
        const { coverSourceUrlChanged } = await updateExistingBook(context, existingByTitle._id, args, cleanedTitle)
        return { bookId: existingByTitle._id, isNew: false, coverSourceUrlChanged }
      }
      console.log('   Title not found in series', {
        normalizedTitle,
        seriesId: args.seriesId,
        checkedCount: checkedTitles.length,
        checkedTitles: checkedTitles.slice(0, 5), // Show first 5 for brevity
      })
    }

    // No existing book found, insert new
    console.log('📗 Creating new book (no dedup match)', { title: cleanedTitle })
    const bookId = await insertNewBook(context, args, cleanedTitle)
    return { bookId, isNew: true, coverSourceUrlChanged: false }
  },
})

async function updateExistingBook(
  context: MutationCtx,
  bookId: Id<'books'>,
  args: {
    title: string
    subtitle?: string
    authors: string[]
    amazonAuthorIds?: string[]
    contributors?: Array<{ name: string; amazonAuthorId?: string; role: string }>
    asin?: string
    amazonUrl?: string
    formats?: Array<{ type: string; asin: string; amazonUrl: string }>
    seriesId?: Id<'series'>
    seriesName?: string
    seriesUrl?: string
    seriesPosition?: number
    publisher?: string
    publishedDate?: string
    pageCount?: number
    description?: string
    coverSourceUrl?: string
    coverWidth?: number
    coverHeight?: number
    coverSourceFormat?: string
    coverSourceAsin?: string
    lexileScore?: number
    ageRangeMin?: number
    ageRangeMax?: number
    ageRange?: string
    gradeLevelMin?: number
    gradeLevelMax?: number
    gradeLevel?: string
    amazonRatingAverage?: number
    amazonRatingCount?: number
    goodreadsRatingAverage?: number
    goodreadsRatingCount?: number
    ratingScore?: number
    source: string
    scrapeVersion?: number
    detailsStatus: 'basic' | 'queued' | 'complete' | 'error'
    coverStatus: 'pending' | 'complete' | 'error'
    firstSeenFromUrl?: string
    firstSeenReason?: string
  },
  cleanedTitle: string,
): Promise<{ coverSourceUrlChanged: boolean }> {
  const existingBook = await context.db.get(bookId)
  if (!existingBook) return { coverSourceUrlChanged: false }

  const existingCover = existingBook.cover ?? {}
  const shouldReplaceCoverSource = shouldReplaceStoredCover({
    existingCoverSourceUrl: typeof existingCover.sourceUrl === 'string' ? existingCover.sourceUrl : undefined,
    existingCoverSourceFormat: typeof existingCover.sourceFormat === 'string' ? existingCover.sourceFormat : undefined,
    incomingCoverSourceUrl: args.coverSourceUrl,
    incomingCoverSourceFormat: args.coverSourceFormat,
  })

  // Track if cover source URL changed (for re-download decision)
  const coverSourceUrlChanged =
    shouldReplaceCoverSource && args.coverSourceUrl !== undefined && args.coverSourceUrl !== existingBook.cover?.sourceUrl

  // Only upgrade detailsStatus, never downgrade
  const shouldUpdateDetails = shouldUpgradeDetailsStatus(existingBook.detailsStatus, args.detailsStatus)

  // Build searchText for full-text search
  const updatedBook = { ...existingBook, ...args, title: cleanedTitle }
  const discoveryScore = computeDiscoveryScore({
    ratingScore: updatedBook.ratingScore,
    amazonRatingCount: updatedBook.amazonRatingCount,
    goodreadsRatingCount: updatedBook.goodreadsRatingCount,
  })
  const searchText = buildSearchText({
    title: cleanedTitle,
    subtitle: updatedBook.subtitle,
    authors: updatedBook.authors,
    asin: updatedBook.asin,
  })

  // Build update object, preserving existing data for undefined fields
  const updates: Record<string, unknown> = {
    title: cleanedTitle,
    authors: args.authors,
    scrapedAt: Date.now(),
    searchText,
  }

  // Only update optional fields if provided (don't overwrite with undefined)
  if (args.subtitle !== undefined) updates.subtitle = args.subtitle
  if (args.amazonAuthorIds !== undefined) updates.amazonAuthorIds = args.amazonAuthorIds
  if (args.contributors !== undefined) updates.contributors = args.contributors
  if (args.asin !== undefined) updates.asin = args.asin
  if (args.amazonUrl !== undefined) updates.amazonUrl = args.amazonUrl
  if (args.seriesId !== undefined) updates.seriesId = args.seriesId
  if (args.seriesName !== undefined) updates.seriesName = args.seriesName
  if (args.seriesUrl !== undefined) updates.seriesUrl = args.seriesUrl
  if (args.seriesPosition !== undefined) updates.seriesPosition = args.seriesPosition
  if (args.publisher !== undefined) updates.publisher = args.publisher
  if (args.publishedDate !== undefined) updates.publishedDate = args.publishedDate
  if (args.pageCount !== undefined) updates.pageCount = args.pageCount
  if (args.description !== undefined) updates.description = args.description

  // Build nested cover object from incoming args, preserving existing values
  const hasCoverUpdates =
    args.coverSourceUrl !== undefined ||
    args.coverWidth !== undefined ||
    args.coverHeight !== undefined ||
    args.coverSourceFormat !== undefined ||
    args.coverSourceAsin !== undefined

  if (hasCoverUpdates) {
    const shouldPreserveMeasuredDimensions =
      (existingCover.storageIdMedium || existingCover.storageIdFull) &&
      (!shouldReplaceCoverSource || args.coverSourceUrl === undefined || args.coverSourceUrl === existingCover.sourceUrl)

    if (args.coverSourceUrl && !shouldReplaceCoverSource && existingCover.sourceUrl) {
      console.log('⏭️ Preserving preferred existing cover', {
        bookId,
        existingFormat: existingCover.sourceFormat ?? 'unknown',
        incomingFormat: args.coverSourceFormat ?? 'unknown',
        existingPriority: getCoverFormatPriority(typeof existingCover.sourceFormat === 'string' ? existingCover.sourceFormat : undefined),
        incomingPriority: getCoverFormatPriority(args.coverSourceFormat),
      })
    }

    updates.cover = {
      ...existingCover,
      ...(shouldReplaceCoverSource && args.coverSourceUrl !== undefined && { sourceUrl: args.coverSourceUrl }),
      ...(shouldReplaceCoverSource && !shouldPreserveMeasuredDimensions && args.coverWidth !== undefined && { width: args.coverWidth }),
      ...(shouldReplaceCoverSource && !shouldPreserveMeasuredDimensions && args.coverHeight !== undefined && { height: args.coverHeight }),
      ...(shouldReplaceCoverSource && args.coverSourceFormat !== undefined && { sourceFormat: args.coverSourceFormat }),
      ...(shouldReplaceCoverSource && args.coverSourceAsin !== undefined && { sourceAsin: args.coverSourceAsin }),
    }
  }

  if (args.lexileScore !== undefined) updates.lexileScore = args.lexileScore
  if (args.ageRangeMin !== undefined) updates.ageRangeMin = args.ageRangeMin
  if (args.ageRangeMax !== undefined) updates.ageRangeMax = args.ageRangeMax
  if (args.ageRange !== undefined) updates.ageRange = args.ageRange
  if (args.gradeLevelMin !== undefined) updates.gradeLevelMin = args.gradeLevelMin
  if (args.gradeLevelMax !== undefined) updates.gradeLevelMax = args.gradeLevelMax
  if (args.gradeLevel !== undefined) updates.gradeLevel = args.gradeLevel
  if (args.amazonRatingAverage !== undefined) updates.amazonRatingAverage = args.amazonRatingAverage
  if (args.amazonRatingCount !== undefined) updates.amazonRatingCount = args.amazonRatingCount
  if (args.goodreadsRatingAverage !== undefined) updates.goodreadsRatingAverage = args.goodreadsRatingAverage
  if (args.goodreadsRatingCount !== undefined) updates.goodreadsRatingCount = args.goodreadsRatingCount
  if (args.ratingScore !== undefined) updates.ratingScore = args.ratingScore
  updates.discoveryScore = discoveryScore
  if (args.scrapeVersion !== undefined) updates.scrapeVersion = args.scrapeVersion
  // Only set firstSeenFromUrl/firstSeenReason if book doesn't already have them (preserve original provenance)
  if (args.firstSeenFromUrl !== undefined && !existingBook.firstSeenFromUrl) {
    updates.firstSeenFromUrl = args.firstSeenFromUrl
  }
  if (args.firstSeenReason !== undefined && !existingBook.firstSeenReason) {
    updates.firstSeenReason = args.firstSeenReason
  }

  if (shouldUpdateDetails) {
    updates.detailsStatus = args.detailsStatus
  }

  // Only update coverStatus if not already complete
  if (existingBook.coverStatus !== 'complete') {
    updates.coverStatus = args.coverStatus
  }

  await context.db.patch(bookId, updates)

  return { coverSourceUrlChanged }
}

async function insertNewBook(
  context: MutationCtx,
  args: {
    title: string
    subtitle?: string
    authors: string[]
    amazonAuthorIds?: string[]
    contributors?: Array<{ name: string; amazonAuthorId?: string; role: string }>
    asin?: string
    amazonUrl?: string
    formats?: Array<{ type: string; asin: string; amazonUrl: string }>
    seriesId?: Id<'series'>
    seriesName?: string
    seriesUrl?: string
    seriesPosition?: number
    publisher?: string
    publishedDate?: string
    pageCount?: number
    description?: string
    coverSourceUrl?: string
    coverWidth?: number
    coverHeight?: number
    coverSourceFormat?: string
    coverSourceAsin?: string
    lexileScore?: number
    ageRangeMin?: number
    ageRangeMax?: number
    ageRange?: string
    gradeLevelMin?: number
    gradeLevelMax?: number
    gradeLevel?: string
    amazonRatingAverage?: number
    amazonRatingCount?: number
    goodreadsRatingAverage?: number
    goodreadsRatingCount?: number
    ratingScore?: number
    source: string
    scrapeVersion?: number
    detailsStatus: 'basic' | 'queued' | 'complete' | 'error'
    coverStatus: 'pending' | 'complete' | 'error'
    firstSeenFromUrl?: string
    firstSeenReason?: string
  },
  cleanedTitle: string,
): Promise<Id<'books'>> {
  // Build searchText for full-text search
  const searchText = buildSearchText({
    title: cleanedTitle,
    subtitle: args.subtitle,
    authors: args.authors,
    asin: args.asin,
  })

  const bookId = await context.db.insert('books', {
    // Required fields
    title: cleanedTitle,
    authors: args.authors,
    source: args.source,
    catalogStatus: 'visible',
    detailsStatus: args.detailsStatus,
    coverStatus: args.coverStatus,
    scrapedAt: Date.now(),
    searchText,
    // Optional fields - only include if defined
    ...(args.subtitle !== undefined && { subtitle: args.subtitle }),
    ...(args.amazonAuthorIds !== undefined && { amazonAuthorIds: args.amazonAuthorIds }),
    ...(args.contributors !== undefined && { contributors: args.contributors }),
    ...(args.asin !== undefined && { asin: args.asin }),
    ...(args.amazonUrl !== undefined && { amazonUrl: args.amazonUrl }),
    ...(args.seriesId !== undefined && { seriesId: args.seriesId }),
    ...(args.seriesName !== undefined && { seriesName: args.seriesName }),
    ...(args.seriesUrl !== undefined && { seriesUrl: args.seriesUrl }),
    ...(args.seriesPosition !== undefined && { seriesPosition: args.seriesPosition }),
    ...(args.publisher !== undefined && { publisher: args.publisher }),
    ...(args.publishedDate !== undefined && { publishedDate: args.publishedDate }),
    ...(args.pageCount !== undefined && { pageCount: args.pageCount }),
    ...(args.description !== undefined && { description: args.description }),
    // Nested cover object
    ...buildCoverObject(args),
    ...(args.lexileScore !== undefined && { lexileScore: args.lexileScore }),
    ...(args.ageRangeMin !== undefined && { ageRangeMin: args.ageRangeMin }),
    ...(args.ageRangeMax !== undefined && { ageRangeMax: args.ageRangeMax }),
    ...(args.ageRange !== undefined && { ageRange: args.ageRange }),
    ...(args.gradeLevelMin !== undefined && { gradeLevelMin: args.gradeLevelMin }),
    ...(args.gradeLevelMax !== undefined && { gradeLevelMax: args.gradeLevelMax }),
    ...(args.gradeLevel !== undefined && { gradeLevel: args.gradeLevel }),
    ...(args.amazonRatingAverage !== undefined && { amazonRatingAverage: args.amazonRatingAverage }),
    ...(args.amazonRatingCount !== undefined && { amazonRatingCount: args.amazonRatingCount }),
    ...(args.goodreadsRatingAverage !== undefined && { goodreadsRatingAverage: args.goodreadsRatingAverage }),
    ...(args.goodreadsRatingCount !== undefined && { goodreadsRatingCount: args.goodreadsRatingCount }),
    ...(args.ratingScore !== undefined && { ratingScore: args.ratingScore }),
    discoveryScore: computeDiscoveryScore({
      ratingScore: args.ratingScore,
      amazonRatingCount: args.amazonRatingCount,
      goodreadsRatingCount: args.goodreadsRatingCount,
    }),
    ...(args.scrapeVersion !== undefined && { scrapeVersion: args.scrapeVersion }),
    ...(args.firstSeenFromUrl !== undefined && { firstSeenFromUrl: args.firstSeenFromUrl }),
    ...(args.firstSeenReason !== undefined && { firstSeenReason: args.firstSeenReason }),
  })
  await context.runMutation(internal.systemStats.mutations.adjustEntityCount, {
    entityType: 'books',
    delta: 1,
  })
  const slug = await generateUniqueBookSlug(context, cleanedTitle, args.authors, args.amazonAuthorIds, bookId)
  await context.db.patch(bookId, { slug })
  return bookId
}

/**
 * Find book by title in series, with logging info for debugging.
 */
async function findBookByTitleInSeriesWithLog(context: MutationCtx, title: string, seriesId: Id<'series'>) {
  const booksInSeries = await context.db
    .query('books')
    .withIndex('by_seriesId', (q) => q.eq('seriesId', seriesId))
    .collect()

  const normalizedSearchTitle = normalizeTitle(title)
  const checkedTitles = booksInSeries.map((book) => normalizeTitle(book.title))

  const match =
    booksInSeries.find((book) => {
      return normalizeTitle(book.title) === normalizedSearchTitle
    }) ?? null

  return { match, checkedTitles }
}

async function findExistingBookByAsin(context: MutationCtx, asin: string) {
  return await context.db
    .query('books')
    .withIndex('by_asin', (q) => q.eq('asin', asin))
    .unique()
}

/**
 * Determine if we should upgrade detailsStatus.
 * Priority: complete > queued > basic > error
 */
function shouldUpgradeDetailsStatus(current: string | undefined, incoming: string): boolean {
  const priority: Record<string, number> = {
    error: 0,
    basic: 1,
    queued: 2,
    complete: 3,
  }

  const currentPriority = priority[current ?? 'basic'] ?? 0
  const incomingPriority = priority[incoming] ?? 0

  return incomingPriority > currentPriority
}

/**
 * Build nested cover object from flat cover fields.
 * Returns empty object if no cover fields are provided.
 */
function buildCoverObject(args: {
  coverSourceUrl?: string
  coverWidth?: number
  coverHeight?: number
  coverSourceFormat?: string
  coverSourceAsin?: string
}): { cover?: Record<string, unknown> } {
  const hasCoverData =
    args.coverSourceUrl !== undefined ||
    args.coverWidth !== undefined ||
    args.coverHeight !== undefined ||
    args.coverSourceFormat !== undefined ||
    args.coverSourceAsin !== undefined

  if (!hasCoverData) return {}

  return {
    cover: {
      ...(args.coverSourceUrl !== undefined && { sourceUrl: args.coverSourceUrl }),
      ...(args.coverWidth !== undefined && { width: args.coverWidth }),
      ...(args.coverHeight !== undefined && { height: args.coverHeight }),
      ...(args.coverSourceFormat !== undefined && { sourceFormat: args.coverSourceFormat }),
      ...(args.coverSourceAsin !== undefined && { sourceAsin: args.coverSourceAsin }),
    },
  }
}

/**
 * Backfill discovery scores after changing discovery ranking logic.
 */
export const backfillDiscoveryScores = internalMutation({
  args: {},
  returns: v.object({
    updated: v.number(),
  }),
  handler: async (context) => {
    const books = await context.db.query('books').collect()
    let updated = 0

    for (const book of books) {
      const ratingScore = book.ratingScore ?? 0
      const discoveryScore = computeDiscoveryScore({
        ratingScore,
        amazonRatingCount: book.amazonRatingCount,
        goodreadsRatingCount: book.goodreadsRatingCount,
      })

      if (book.ratingScore !== ratingScore || book.discoveryScore !== discoveryScore) {
        await context.db.patch(book._id, {
          ratingScore,
          discoveryScore,
        })
        updated++
      }
    }

    return { updated }
  },
})
