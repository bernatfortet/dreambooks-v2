import { internalMutation, mutation } from '../_generated/server'
import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { generateUniqueSlug, generateUniqueBookSlug } from '../lib/slug'
import { deleteScrapeArtifacts, clearScrapeQueueReferences, deleteStorageFile } from '../lib/deleteHelpers'
import { requireSuperadmin } from '../lib/superadmin'
import { buildSearchText } from './lib/searchText'
import type { DatabaseReader, MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

// Args shape reused across create and upsert
const bookArgs = {
  title: v.string(),
  subtitle: v.optional(v.string()),
  authors: v.array(v.string()),
  // Amazon author IDs extracted from byline links - used for linking to authors table
  amazonAuthorIds: v.optional(v.array(v.string())),
  // ISBNs accepted for lookup only (not stored on books table - exist only on editions)
  isbn10: v.optional(v.string()),
  isbn13: v.optional(v.string()),
  asin: v.optional(v.string()),
  amazonUrl: v.optional(v.string()),
  // Available formats (hardcover, paperback, kindle, audiobook, etc.)
  formats: v.optional(
    v.array(
      v.object({
        type: v.string(),
        asin: v.string(),
        amazonUrl: v.string(),
      }),
    ),
  ),
  // Series
  seriesName: v.optional(v.string()),
  seriesUrl: v.optional(v.string()),
  seriesPosition: v.optional(v.number()),
  // Details
  publisher: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  description: v.optional(v.string()),
  coverSourceUrl: v.optional(v.string()),
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
  source: v.string(),
  // Scrape version - tracks which version of the scraping logic produced this data
  scrapeVersion: v.optional(v.number()),
  detailsStatus: v.union(v.literal('basic'), v.literal('queued'), v.literal('complete'), v.literal('error')),
  coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
  scrapedAt: v.number(),
}

export const create = internalMutation({
  args: bookArgs,
  handler: async (context, args) => {
    // Exclude isbn10/isbn13 (lookup only) and cover source fields
    const { coverSourceUrl, coverSourceFormat, coverSourceAsin, formats: _formats, isbn10: _isbn10, isbn13: _isbn13, ...rest } = args

    const coverFromArgs = buildCoverFromSourceArgs({ coverSourceUrl, coverSourceFormat, coverSourceAsin })
    const cover = coverFromArgs ? { ...coverFromArgs } : undefined

    const searchText = buildSearchText(rest)
    const id = await context.db.insert('books', { ...rest, ...(cover ? { cover } : {}), searchText })
    const slug = await generateUniqueBookSlug(context, args.title, args.authors, args.amazonAuthorIds, id)
    await context.db.patch(id, { slug })
    return id
  },
})

/**
 * @deprecated Use internal.books.internal.createOrUpdate instead for new code.
 * This mutation is kept for backward compatibility.
 */
export const upsertFromScrape = internalMutation({
  args: bookArgs,
  returns: v.id('books'),
  handler: async (context, args): Promise<Id<'books'>> => {
    // Clean title: remove series names in parentheses
    const cleanedTitle = args.title?.replace(/\s*\([^)]+\)\s*$/, '').trim() || args.title
    const cleanedArgs = { ...args, title: cleanedTitle }

    // If asin exists, use it as primary idempotency key
    if (cleanedArgs.asin) {
      const existingByAsin = await context.db
        .query('books')
        .withIndex('by_asin', (q) => q.eq('asin', cleanedArgs.asin))
        .unique()

      if (existingByAsin) {
        // Exclude isbn10/isbn13 (lookup only) and cover source fields
        const {
          coverSourceUrl,
          coverSourceFormat,
          coverSourceAsin,
          formats: _formats,
          isbn10: _isbn10,
          isbn13: _isbn13,
          ...rest
        } = cleanedArgs

        const coverFromArgs = buildCoverFromSourceArgs({ coverSourceUrl, coverSourceFormat, coverSourceAsin })
        const cover = coverFromArgs ? { ...(existingByAsin.cover ?? {}), ...coverFromArgs } : undefined

        const searchText = buildSearchText(rest)
        await context.db.patch(existingByAsin._id, { ...rest, ...(cover ? { cover } : {}), searchText })
        const titleChanged = cleanedArgs.title !== existingByAsin.title
        const firstAuthorChanged = cleanedArgs.authors[0] !== existingByAsin.authors[0]
        const amazonAuthorIdChanged = cleanedArgs.amazonAuthorIds?.[0] !== existingByAsin.amazonAuthorIds?.[0]
        if (titleChanged || firstAuthorChanged || amazonAuthorIdChanged) {
          const slug = await generateUniqueBookSlug(
            context,
            cleanedArgs.title,
            cleanedArgs.authors,
            cleanedArgs.amazonAuthorIds,
            existingByAsin._id,
          )
          await context.db.patch(existingByAsin._id, { slug })
        }
        return existingByAsin._id
      }
    }

    // Fallback: isbn13 via bookIdentifiers
    if (cleanedArgs.isbn13) {
      const resolved: { book: Doc<'books'>; matchedBy: 'asin' | 'isbn13' | 'isbn10' } | null = await context.runQuery(
        internal.bookIdentifiers.queries.resolveToBook,
        {
          isbn13: cleanedArgs.isbn13,
        },
      )

      if (resolved?.book) {
        const {
          coverSourceUrl,
          coverSourceFormat,
          coverSourceAsin,
          formats: _formats,
          isbn10: _isbn10,
          isbn13: _isbn13,
          ...rest
        } = cleanedArgs

        const coverFromArgs = buildCoverFromSourceArgs({ coverSourceUrl, coverSourceFormat, coverSourceAsin })
        const cover = coverFromArgs ? { ...(resolved.book.cover ?? {}), ...coverFromArgs } : undefined

        const searchText = buildSearchText(rest)
        await context.db.patch(resolved.book._id, { ...rest, ...(cover ? { cover } : {}), searchText })
        const titleChanged = cleanedArgs.title !== resolved.book.title
        const firstAuthorChanged = cleanedArgs.authors[0] !== resolved.book.authors[0]
        const amazonAuthorIdChanged = cleanedArgs.amazonAuthorIds?.[0] !== resolved.book.amazonAuthorIds?.[0]
        if (titleChanged || firstAuthorChanged || amazonAuthorIdChanged) {
          const slug = await generateUniqueBookSlug(
            context,
            cleanedArgs.title,
            cleanedArgs.authors,
            cleanedArgs.amazonAuthorIds,
            resolved.book._id,
          )
          await context.db.patch(resolved.book._id, { slug })
        }
        return resolved.book._id
      }
    }

    const { coverSourceUrl, coverSourceFormat, coverSourceAsin, formats: _formats, isbn10: _isbn10, isbn13: _isbn13, ...rest } = cleanedArgs

    const coverFromArgs = buildCoverFromSourceArgs({ coverSourceUrl, coverSourceFormat, coverSourceAsin })
    const cover = coverFromArgs ? { ...coverFromArgs } : undefined

    const searchText = buildSearchText(rest)
    const bookId = await context.db.insert('books', { ...rest, ...(cover ? { cover } : {}), searchText })
    const slug = await generateUniqueBookSlug(context, cleanedArgs.title, cleanedArgs.authors, cleanedArgs.amazonAuthorIds, bookId)
    await context.db.patch(bookId, { slug })
    return bookId
  },
})

function buildCoverFromSourceArgs(args: {
  coverSourceUrl?: string
  coverSourceFormat?: string
  coverSourceAsin?: string
}): { sourceUrl?: string; sourceFormat?: string; sourceAsin?: string } | null {
  const hasCoverData = args.coverSourceUrl || args.coverSourceFormat || args.coverSourceAsin
  if (!hasCoverData) return null

  return {
    ...(args.coverSourceUrl ? { sourceUrl: args.coverSourceUrl } : {}),
    ...(args.coverSourceFormat ? { sourceFormat: args.coverSourceFormat } : {}),
    ...(args.coverSourceAsin ? { sourceAsin: args.coverSourceAsin } : {}),
  }
}

export const updateCover = internalMutation({
  args: {
    bookId: v.id('books'),
    coverStorageIdThumb: v.optional(v.id('_storage')), // Thumbnail (~100px) for small grids
    coverStorageId: v.id('_storage'), // Medium resolution for grids
    coverStorageIdFull: v.optional(v.id('_storage')), // Full resolution for detail pages
    coverBlurHash: v.optional(v.string()),
    coverDominantColor: v.optional(v.string()), // hex color like "#a4c2e8"
    coverStatus: v.union(v.literal('pending'), v.literal('complete'), v.literal('error')),
    // Actual measured dimensions from downloaded image
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) return null

    const thumbId = args.coverStorageIdThumb ?? args.coverStorageId
    const mediumId = args.coverStorageId
    const fullId = args.coverStorageIdFull ?? args.coverStorageId

    // Build nested cover object, preserving existing source fields
    const existingCover = book.cover ?? {}
    const cover = {
      ...existingCover,
      storageIdThumb: thumbId,
      storageIdMedium: mediumId,
      storageIdFull: fullId,
      blurHash: args.coverBlurHash ?? existingCover.blurHash,
      dominantColor: args.coverDominantColor ?? existingCover.dominantColor,
      // Store actual measured dimensions (overwrite any scraped metadata)
      ...(args.width !== undefined && { width: args.width }),
      ...(args.height !== undefined && { height: args.height }),
    }

    await context.db.patch(args.bookId, {
      coverStatus: args.coverStatus,
      cover,
    })
    return null
  },
})

export const updateStatus = internalMutation({
  args: {
    bookId: v.id('books'),
    detailsStatus: v.optional(v.union(v.literal('basic'), v.literal('queued'), v.literal('complete'), v.literal('error'))),
    coverStatus: v.optional(v.union(v.literal('pending'), v.literal('complete'), v.literal('error'))),
    errorMessage: v.optional(v.string()),
  },
  handler: async (context, args) => {
    const { bookId, ...updates } = args

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

    await context.db.patch(bookId, filteredUpdates)
  },
})

export const applyNeedsReviewFromScrape = internalMutation({
  args: {
    bookId: v.id('books'),
    needsReview: v.boolean(),
    reason: v.optional(v.string()),
    signalKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) return null

    if (book.catalogStatus === 'hidden') {
      return null
    }

    if (!args.needsReview) {
      return null
    }

    await context.db.patch(args.bookId, {
      needsReview: true,
      needsReviewReason: args.reason,
      needsReviewSignalKey: args.signalKey,
      needsReviewMarkedAt: Date.now(),
    })

    return null
  },
})

export const markNeedsReview = mutation({
  args: {
    bookId: v.id('books'),
    reason: v.optional(v.string()),
    signalKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    await context.db.patch(args.bookId, {
      needsReview: true,
      needsReviewReason: args.reason,
      needsReviewSignalKey: args.signalKey,
      needsReviewMarkedAt: Date.now(),
    })

    return null
  },
})

export const clearNeedsReview = mutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    await context.db.patch(args.bookId, {
      needsReview: false,
      needsReviewReason: undefined,
      needsReviewSignalKey: undefined,
      needsReviewMarkedAt: undefined,
    })

    return null
  },
})

export const hideBook = mutation({
  args: {
    bookId: v.id('books'),
    hiddenReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    await context.db.patch(args.bookId, {
      catalogStatus: 'hidden',
      hiddenReason: args.hiddenReason,
      hiddenAt: Date.now(),
      needsReview: false,
      needsReviewReason: undefined,
      needsReviewSignalKey: undefined,
      needsReviewMarkedAt: undefined,
    })

    return null
  },
})

export const unhideBook = mutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    await context.db.patch(args.bookId, {
      catalogStatus: 'visible',
      hiddenReason: undefined,
      hiddenAt: undefined,
    })

    return null
  },
})

/**
 * Set the primary edition for a book.
 * The primary edition is the "main" bookEditions record (typically the one originally scraped).
 */
export const setPrimaryEdition = internalMutation({
  args: {
    bookId: v.id('books'),
    primaryEditionId: v.id('bookEditions'),
  },
  handler: async (context, args) => {
    await context.db.patch(args.bookId, { primaryEditionId: args.primaryEditionId })
  },
})

/**
 * Update a book's publisher field (denormalized from primary edition).
 */
export const updatePublisher = internalMutation({
  args: {
    bookId: v.id('books'),
    publisher: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.bookId, { publisher: args.publisher })
    return null
  },
})

/**
 * Update a book's series URL (admin utility).
 */
export const updateSeriesUrl = mutation({
  args: {
    bookId: v.id('books'),
    seriesUrl: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)

    if (!book) {
      throw new Error('Book not found')
    }

    console.log('💾 Updating book seriesUrl', { bookId: args.bookId, seriesUrl: args.seriesUrl })

    await context.db.patch(args.bookId, {
      seriesUrl: args.seriesUrl,
    })

    return null
  },
})

/**
 * Update a book's series information (name, URL, position).
 */
export const updateSeriesInfo = mutation({
  args: {
    bookId: v.id('books'),
    seriesName: v.string(),
    seriesUrl: v.string(),
    seriesPosition: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)

    if (!book) {
      throw new Error('Book not found')
    }

    console.log('💾 Updating book series info', {
      bookId: args.bookId,
      seriesName: args.seriesName,
      seriesUrl: args.seriesUrl,
      seriesPosition: args.seriesPosition,
    })

    await context.db.patch(args.bookId, {
      seriesName: args.seriesName,
      seriesUrl: args.seriesUrl,
      seriesPosition: args.seriesPosition,
    })

    return null
  },
})

/**
 * Internal mutation to delete a book with all cascading cleanup.
 * Can be called from other mutations (e.g., when deleting a series).
 */
export const internalDeleteBook = internalMutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)

    if (!book) {
      return null
    }

    // Delete all bookAuthors entries
    const bookAuthors = await context.db
      .query('bookAuthors')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const link of bookAuthors) {
      await context.db.delete(link._id)
    }

    // Delete all bookAwards entries
    const bookAwards = await context.db
      .query('bookAwards')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const award of bookAwards) {
      await context.db.delete(award._id)
    }

    // Delete cover storage files (thumb, medium, and full resolution)
    const coverIdsToDelete = new Set<Id<'_storage'>>()
    if (book.cover?.storageIdThumb) coverIdsToDelete.add(book.cover.storageIdThumb)
    if (book.cover?.storageIdMedium) coverIdsToDelete.add(book.cover.storageIdMedium)
    if (book.cover?.storageIdFull) coverIdsToDelete.add(book.cover.storageIdFull)

    for (const storageId of coverIdsToDelete) {
      await deleteStorageFile(context.storage, storageId)
    }

    // Delete bookEditions
    const bookEditions = await context.db
      .query('bookEditions')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const edition of bookEditions) {
      await context.db.delete(edition._id)
    }

    // Delete bookIdentifiers
    const bookIdentifiers = await context.db
      .query('bookIdentifiers')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const identifier of bookIdentifiers) {
      await context.db.delete(identifier._id)
    }

    // Delete bookCoverCandidates
    const bookCoverCandidates = await context.db
      .query('bookCoverCandidates')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const candidate of bookCoverCandidates) {
      await context.db.delete(candidate._id)
    }

    // Delete scrape artifacts
    const artifactsDeleted = await deleteScrapeArtifacts(context.db, 'book', args.bookId)

    // Clear scrape queue references
    const queueCleared = await clearScrapeQueueReferences(context.db, 'book', args.bookId)

    console.log('🗑️ Book cleanup complete', {
      bookId: args.bookId,
      editionsDeleted: bookEditions.length,
      identifiersDeleted: bookIdentifiers.length,
      coverCandidatesDeleted: bookCoverCandidates.length,
      artifactsDeleted,
      queueCleared,
    })

    // Delete the book
    await context.db.delete(args.bookId)

    return null
  },
})

/**
 * Delete a book (admin utility).
 * Cascades to delete:
 * - All bookAuthors entries
 * - All bookAwards entries
 * - All bookEditions entries
 * - All bookIdentifiers entries
 * - All bookCoverCandidates entries
 * - Cover storage files (thumb, medium, full)
 * - Scrape artifacts
 * - Scrape queue references
 */
export const deleteBook = mutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await requireSuperadmin(context)

    const book = await context.db.get(args.bookId)

    if (!book) {
      throw new Error('Book not found')
    }

    console.log('🗑️ Deleting book', { bookId: args.bookId, title: book.title })

    await context.runMutation(internal.books.mutations.internalDeleteBook, {
      bookId: args.bookId,
    })

    console.log('✅ Book deleted', { bookId: args.bookId })

    return null
  },
})

/**
 * Update a book with enriched data from scraping.
 * Used by local scraping worker.
 */
export const updateFromEnrichment = mutation({
  args: {
    bookId: v.id('books'),
    subtitle: v.optional(v.string()),
    asin: v.optional(v.string()),
    amazonUrl: v.optional(v.string()),
    publisher: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    description: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
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
    seriesName: v.optional(v.string()),
    seriesUrl: v.optional(v.string()),
    seriesPosition: v.optional(v.number()),
    // Scrape version
    scrapeVersion: v.optional(v.number()),
    // Available formats
    formats: v.optional(
      v.array(
        v.object({
          type: v.string(),
          asin: v.string(),
          amazonUrl: v.string(),
        }),
      ),
    ),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const { bookId, coverImageUrl, ...updates } = args

    const book = await context.db.get(bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    console.log('📝 Enriching book', { bookId, title: book.title })

    // Build update object, only including defined values
    const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))

    // Rebuild searchText if any searchable fields changed
    const updatedBook = { ...book, ...filteredUpdates }
    const searchText = buildSearchText({
      title: updatedBook.title,
      subtitle: updatedBook.subtitle,
      authors: updatedBook.authors,
      asin: updatedBook.asin,
    })

    // Build nested cover object update if coverImageUrl provided
    const coverUpdate = coverImageUrl
      ? {
          cover: {
            ...(book.cover ?? {}),
            sourceUrl: coverImageUrl,
          },
        }
      : {}

    // Mark as complete and update scrapedAt
    await context.db.patch(bookId, {
      ...filteredUpdates,
      ...coverUpdate,
      detailsStatus: 'complete',
      scrapedAt: Date.now(),
      searchText,
    })

    // Schedule cover download if we have a new cover URL and cover isn't already downloaded
    if (coverImageUrl && !book.cover?.storageIdMedium && book.coverStatus !== 'complete') {
      const { internal } = await import('../_generated/api')
      await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
        bookId,
        sourceUrl: coverImageUrl,
      })
    }

    return null
  },
})

/**
 * Mark a book as having an enrichment error.
 * Used by local scraping worker.
 */
export const markEnrichmentError = mutation({
  args: {
    bookId: v.id('books'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    console.log('🚨 Marking book enrichment error', { bookId: args.bookId, error: args.errorMessage })

    await context.db.patch(args.bookId, {
      detailsStatus: 'error',
      errorMessage: args.errorMessage,
    })

    return null
  },
})

/**
 * Update a book's slug (for migration).
 */
export const updateSlug = mutation({
  args: {
    bookId: v.id('books'),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const book = await context.db.get(args.bookId)
    if (!book) {
      throw new Error('Book not found')
    }
    const slug = await generateUniqueBookSlug(context, args.title, book.authors, book.amazonAuthorIds, args.bookId)
    await context.db.patch(args.bookId, { slug })
    return null
  },
})

/**
 * Migration utility: merge duplicate books within a series by seriesPosition.
 *
 * This is an internal mutation and should be called via a protected action.
 */
type BookDoc = Doc<'books'>
type MergeGroup = { seriesId: Id<'series'>; seriesPosition: number; books: BookDoc[] }
type MergeResult = {
  seriesId: Id<'series'>
  seriesPosition: number
  keeperBookId: Id<'books'>
  deletedBookIds: Id<'books'>[]
}

export const mergeDuplicatesBySeriesPosition = internalMutation({
  args: {
    seriesId: v.optional(v.id('series')),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    groupsFound: v.number(),
    booksDeleted: v.number(),
    merges: v.array(
      v.object({
        seriesId: v.id('series'),
        seriesPosition: v.number(),
        keeperBookId: v.id('books'),
        deletedBookIds: v.array(v.id('books')),
      }),
    ),
  }),
  handler: async (context, args) => {
    const dryRun = args.dryRun ?? true
    const limit = args.limit ?? 50

    const books = await collectBooksForMerge(context.db, args.seriesId)
    const groups = groupBooksBySeriesPosition(books)

    const merges: MergeResult[] = []

    let booksDeleted = 0

    for (const group of groups) {
      if (merges.length >= limit) break

      const keeper = pickKeeperBook(group.books)
      const duplicates = group.books.filter((b) => b._id !== keeper._id)
      if (duplicates.length === 0) continue

      if (!dryRun) {
        for (const duplicate of duplicates) {
          await moveBookRelations(context, { fromBookId: duplicate._id, toBookId: keeper._id })
        }

        const mergedFormats = mergeFormats(
          keeper.formats,
          duplicates.flatMap((b) => b.formats ?? []),
        )
        const patch: Partial<BookDoc> = {}
        if (mergedFormats) patch.formats = mergedFormats

        // Keep keeper data; only fill missing identifiers/URLs
        const bestDuplicate = pickBestDataSource(duplicates)
        if (!keeper.asin && bestDuplicate?.asin) patch.asin = bestDuplicate.asin
        if (!keeper.amazonUrl && bestDuplicate?.amazonUrl) patch.amazonUrl = bestDuplicate.amazonUrl

        if (Object.keys(patch).length > 0) {
          const searchText = buildSearchText({
            title: keeper.title,
            subtitle: keeper.subtitle,
            authors: keeper.authors,
            asin: patch.asin ?? keeper.asin,
          })
          await context.db.patch(keeper._id, { ...patch, searchText })
        }

        for (const duplicate of duplicates) {
          await context.runMutation(internal.books.mutations.internalDeleteBook, { bookId: duplicate._id })
          booksDeleted++
        }
      }

      merges.push({
        seriesId: group.seriesId,
        seriesPosition: group.seriesPosition,
        keeperBookId: keeper._id,
        deletedBookIds: duplicates.map((b) => b._id),
      })
    }

    return {
      groupsFound: groups.length,
      booksDeleted,
      merges,
    }
  },
})

function groupBooksBySeriesPosition(books: BookDoc[]): MergeGroup[] {
  const map = new Map<string, MergeGroup>()

  for (const book of books) {
    if (!book.seriesId) continue
    if (book.seriesPosition === undefined || book.seriesPosition === null) continue

    const key = `${book.seriesId}-${book.seriesPosition}`
    const entry = map.get(key) ?? { seriesId: book.seriesId, seriesPosition: book.seriesPosition, books: [] }
    entry.books.push(book)
    map.set(key, entry)
  }

  return Array.from(map.values()).filter((g) => g.books.length > 1)
}

async function collectBooksForMerge(db: DatabaseReader, seriesId?: Id<'series'>): Promise<BookDoc[]> {
  if (!seriesId) {
    throw new Error('seriesId is required for this migration')
  }

  return await db
    .query('books')
    .withIndex('by_seriesId', (q) => q.eq('seriesId', seriesId))
    .collect()
}

function pickKeeperBook(books: BookDoc[]): BookDoc {
  const sorted = [...books].sort((a, b) => {
    const aScore = detailsStatusScore(a.detailsStatus)
    const bScore = detailsStatusScore(b.detailsStatus)
    if (aScore !== bScore) return bScore - aScore

    const aHasCover = a.cover?.storageIdMedium ? 1 : 0
    const bHasCover = b.cover?.storageIdMedium ? 1 : 0
    if (aHasCover !== bHasCover) return bHasCover - aHasCover

    return (a.scrapedAt ?? 0) - (b.scrapedAt ?? 0)
  })

  return sorted[0]
}

function pickBestDataSource(books: BookDoc[]): BookDoc | null {
  return [...books].sort((a, b) => detailsStatusScore(b.detailsStatus) - detailsStatusScore(a.detailsStatus))[0] ?? null
}

function detailsStatusScore(detailsStatus: string | undefined) {
  const priority: Record<string, number> = { error: 0, basic: 1, queued: 2, complete: 3 }
  return priority[detailsStatus ?? 'basic'] ?? 0
}

function mergeFormats(
  existing: BookDoc['formats'] | undefined,
  incoming: Array<{ type: string; asin: string; amazonUrl: string }>,
): BookDoc['formats'] | undefined {
  const all = [...(existing ?? []), ...(incoming ?? [])]
  if (all.length === 0) return undefined

  const byAsin = new Map<string, { type: string; asin: string; amazonUrl: string }>()
  for (const f of all) {
    if (!f.asin) continue
    if (!byAsin.has(f.asin)) {
      byAsin.set(f.asin, { type: f.type, asin: f.asin, amazonUrl: f.amazonUrl })
    }
  }

  return Array.from(byAsin.values())
}

/**
 * Backfill searchText for existing books that don't have it.
 * Run this once to enable search for all existing books.
 */
export const backfillSearchText = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    updated: v.number(),
    nextCursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async (context, args) => {
    const batchSize = args.batchSize ?? 100

    // Get books without searchText
    const result = await context.db.query('books').paginate({ cursor: args.cursor ?? null, numItems: batchSize })

    let updated = 0
    for (const book of result.page) {
      // Only update if searchText is missing
      if (!book.searchText) {
        const searchText = buildSearchText({
          title: book.title,
          subtitle: book.subtitle,
          authors: book.authors,
          asin: book.asin,
        })
        await context.db.patch(book._id, { searchText })
        updated++
      }
    }

    return {
      updated,
      nextCursor: result.continueCursor ?? null,
      done: result.isDone,
    }
  },
})

async function moveBookRelations(context: MutationCtx, params: { fromBookId: Id<'books'>; toBookId: Id<'books'> }) {
  const { fromBookId, toBookId } = params

  // bookAuthors
  const bookAuthors = await context.db
    .query('bookAuthors')
    .withIndex('by_bookId', (q) => q.eq('bookId', fromBookId))
    .collect()
  for (const link of bookAuthors) {
    const existing = await context.db
      .query('bookAuthors')
      .withIndex('by_bookId_authorId', (q) => q.eq('bookId', toBookId).eq('authorId', link.authorId))
      .unique()
    if (existing) {
      await context.db.delete(link._id)
      continue
    }
    await context.db.patch(link._id, { bookId: toBookId })
  }

  // bookAwards
  const bookAwards = await context.db
    .query('bookAwards')
    .withIndex('by_bookId', (q) => q.eq('bookId', fromBookId))
    .collect()
  for (const link of bookAwards) {
    const existing = await context.db
      .query('bookAwards')
      .withIndex('by_bookId_awardId_year_resultType', (q) =>
        q.eq('bookId', toBookId).eq('awardId', link.awardId).eq('year', link.year).eq('resultType', link.resultType),
      )
      .unique()
    if (existing) {
      await context.db.delete(link._id)
      continue
    }
    await context.db.patch(link._id, { bookId: toBookId })
  }

  // scrapeArtifacts (indexed by entityId)
  const artifacts = await context.db
    .query('scrapeArtifacts')
    .withIndex('by_entityId', (q) => q.eq('entityId', fromBookId))
    .collect()
  for (const artifact of artifacts) {
    if (artifact.entityType !== 'book') continue
    await context.db.patch(artifact._id, { entityId: toBookId })
  }

  // scrapeQueue (small table; patch references when present)
  const queueItems = await context.db
    .query('scrapeQueue')
    .filter((q) => q.eq(q.field('bookId'), fromBookId))
    .collect()
  for (const item of queueItems) {
    await context.db.patch(item._id, { bookId: toBookId })
  }
}
