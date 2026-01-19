import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { MutationCtx } from '../_generated/server'

/**
 * Shared book fields validator for create/update operations.
 */
const bookFieldsValidator = {
  title: v.string(),
  subtitle: v.optional(v.string()),
  authors: v.array(v.string()),
  amazonAuthorIds: v.optional(v.array(v.string())),
  isbn10: v.optional(v.string()),
  isbn13: v.optional(v.string()),
  asin: v.optional(v.string()),
  amazonUrl: v.optional(v.string()),
  formats: v.optional(
    v.array(
      v.object({
        type: v.string(),
        asin: v.string(),
        amazonUrl: v.string(),
      })
    )
  ),
  seriesId: v.optional(v.id('series')),
  seriesName: v.optional(v.string()),
  seriesUrl: v.optional(v.string()),
  seriesPosition: v.optional(v.number()),
  publisher: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  description: v.optional(v.string()),
  coverSourceUrl: v.optional(v.string()),
  lexileScore: v.optional(v.number()),
  ageRange: v.optional(v.string()),
  gradeLevel: v.optional(v.string()),
  source: v.string(),
}

/**
 * Clean title by removing series names in parentheses at the end.
 */
function cleanTitle(title: string): string {
  return title?.replace(/\s*\([^)]+\)\s*$/, '').trim() || title
}

/**
 * Normalize title for comparison (lowercase, collapse whitespace).
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Unified book creation/update mutation.
 *
 * Deduplication order:
 * 1. ASIN (most reliable)
 * 2. ISBN-13
 * 3. Title within series (if seriesId provided)
 *
 * Returns { bookId, isNew }
 */
export const createOrUpdate = internalMutation({
  args: {
    ...bookFieldsValidator,
    detailsStatus: v.union(
      v.literal('basic'),
      v.literal('queued'),
      v.literal('complete'),
      v.literal('error')
    ),
    coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
  },
  returns: v.object({
    bookId: v.id('books'),
    isNew: v.boolean(),
  }),
  handler: async (context, args) => {
    const cleanedTitle = cleanTitle(args.title)

    // Try to find existing book by ASIN (most reliable)
    if (args.asin) {
      const existingByAsin = await context.db
        .query('books')
        .withIndex('by_asin', (q) => q.eq('asin', args.asin))
        .unique()

      if (existingByAsin) {
        await updateExistingBook(context, existingByAsin._id, args, cleanedTitle)
        return { bookId: existingByAsin._id, isNew: false }
      }
    }

    // Fallback: try ISBN-13
    if (args.isbn13) {
      const existingByIsbn = await context.db
        .query('books')
        .withIndex('by_isbn13', (q) => q.eq('isbn13', args.isbn13))
        .unique()

      if (existingByIsbn) {
        await updateExistingBook(context, existingByIsbn._id, args, cleanedTitle)
        return { bookId: existingByIsbn._id, isNew: false }
      }
    }

    // Fallback: try title match within series
    if (args.seriesId) {
      const existingByTitle = await findBookByTitleInSeries(
        context,
        cleanedTitle,
        args.seriesId
      )

      if (existingByTitle) {
        await updateExistingBook(context, existingByTitle._id, args, cleanedTitle)
        return { bookId: existingByTitle._id, isNew: false }
      }
    }

    // No existing book found, insert new
    const bookId = await insertNewBook(context, args, cleanedTitle)
    return { bookId, isNew: true }
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
    isbn10?: string
    isbn13?: string
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
    lexileScore?: number
    ageRange?: string
    gradeLevel?: string
    source: string
    detailsStatus: 'basic' | 'queued' | 'complete' | 'error'
    coverStatus: 'pending' | 'complete' | 'error'
  },
  cleanedTitle: string
): Promise<void> {
  const existingBook = await context.db.get(bookId)
  if (!existingBook) return

  // Only upgrade detailsStatus, never downgrade
  const shouldUpdateDetails = shouldUpgradeDetailsStatus(
    existingBook.detailsStatus,
    args.detailsStatus
  )

  // Build update object, preserving existing data for undefined fields
  const updates: Record<string, unknown> = {
    title: cleanedTitle,
    authors: args.authors,
    scrapedAt: Date.now(),
  }

  // Only update optional fields if provided (don't overwrite with undefined)
  if (args.subtitle !== undefined) updates.subtitle = args.subtitle
  if (args.amazonAuthorIds !== undefined) updates.amazonAuthorIds = args.amazonAuthorIds
  if (args.isbn10 !== undefined) updates.isbn10 = args.isbn10
  if (args.isbn13 !== undefined) updates.isbn13 = args.isbn13
  if (args.asin !== undefined) updates.asin = args.asin
  if (args.amazonUrl !== undefined) updates.amazonUrl = args.amazonUrl
  if (args.formats !== undefined) updates.formats = args.formats
  if (args.seriesId !== undefined) updates.seriesId = args.seriesId
  if (args.seriesName !== undefined) updates.seriesName = args.seriesName
  if (args.seriesUrl !== undefined) updates.seriesUrl = args.seriesUrl
  if (args.seriesPosition !== undefined) updates.seriesPosition = args.seriesPosition
  if (args.publisher !== undefined) updates.publisher = args.publisher
  if (args.publishedDate !== undefined) updates.publishedDate = args.publishedDate
  if (args.pageCount !== undefined) updates.pageCount = args.pageCount
  if (args.description !== undefined) updates.description = args.description
  if (args.coverSourceUrl !== undefined) updates.coverSourceUrl = args.coverSourceUrl
  if (args.lexileScore !== undefined) updates.lexileScore = args.lexileScore
  if (args.ageRange !== undefined) updates.ageRange = args.ageRange
  if (args.gradeLevel !== undefined) updates.gradeLevel = args.gradeLevel

  if (shouldUpdateDetails) {
    updates.detailsStatus = args.detailsStatus
  }

  // Only update coverStatus if not already complete
  if (existingBook.coverStatus !== 'complete') {
    updates.coverStatus = args.coverStatus
  }

  await context.db.patch(bookId, updates)
}

async function insertNewBook(
  context: MutationCtx,
  args: {
    title: string
    subtitle?: string
    authors: string[]
    amazonAuthorIds?: string[]
    isbn10?: string
    isbn13?: string
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
    lexileScore?: number
    ageRange?: string
    gradeLevel?: string
    source: string
    detailsStatus: 'basic' | 'queued' | 'complete' | 'error'
    coverStatus: 'pending' | 'complete' | 'error'
  },
  cleanedTitle: string
): Promise<Id<'books'>> {
  return await context.db.insert('books', {
    // Required fields
    title: cleanedTitle,
    authors: args.authors,
    source: args.source,
    detailsStatus: args.detailsStatus,
    coverStatus: args.coverStatus,
    scrapedAt: Date.now(),
    // Optional fields - only include if defined
    ...(args.subtitle !== undefined && { subtitle: args.subtitle }),
    ...(args.amazonAuthorIds !== undefined && { amazonAuthorIds: args.amazonAuthorIds }),
    ...(args.isbn10 !== undefined && { isbn10: args.isbn10 }),
    ...(args.isbn13 !== undefined && { isbn13: args.isbn13 }),
    ...(args.asin !== undefined && { asin: args.asin }),
    ...(args.amazonUrl !== undefined && { amazonUrl: args.amazonUrl }),
    ...(args.formats !== undefined && { formats: args.formats }),
    ...(args.seriesId !== undefined && { seriesId: args.seriesId }),
    ...(args.seriesName !== undefined && { seriesName: args.seriesName }),
    ...(args.seriesUrl !== undefined && { seriesUrl: args.seriesUrl }),
    ...(args.seriesPosition !== undefined && { seriesPosition: args.seriesPosition }),
    ...(args.publisher !== undefined && { publisher: args.publisher }),
    ...(args.publishedDate !== undefined && { publishedDate: args.publishedDate }),
    ...(args.pageCount !== undefined && { pageCount: args.pageCount }),
    ...(args.description !== undefined && { description: args.description }),
    ...(args.coverSourceUrl !== undefined && { coverSourceUrl: args.coverSourceUrl }),
    ...(args.lexileScore !== undefined && { lexileScore: args.lexileScore }),
    ...(args.ageRange !== undefined && { ageRange: args.ageRange }),
    ...(args.gradeLevel !== undefined && { gradeLevel: args.gradeLevel }),
  })
}

async function findBookByTitleInSeries(
  context: MutationCtx,
  title: string,
  seriesId: Id<'series'>
) {
  const booksInSeries = await context.db
    .query('books')
    .withIndex('by_seriesId', (q) => q.eq('seriesId', seriesId))
    .collect()

  const normalizedSearchTitle = normalizeTitle(title)

  return booksInSeries.find((book) => {
    return normalizeTitle(book.title) === normalizedSearchTitle
  }) ?? null
}

/**
 * Determine if we should upgrade detailsStatus.
 * Priority: complete > queued > basic > error
 */
function shouldUpgradeDetailsStatus(
  current: string | undefined,
  incoming: string
): boolean {
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
