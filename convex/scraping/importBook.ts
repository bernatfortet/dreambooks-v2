'use node'

import { action, type ActionCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { SCRAPE_VERSIONS } from '../lib/scrapeVersions'

// Validator for edition data
const editionDataValidator = v.object({
  format: v.string(),
  asin: v.string(),
  amazonUrl: v.string(),
  isbn10: v.optional(v.string()),
  isbn13: v.optional(v.string()),
  mainCoverUrl: v.optional(v.string()),
  coverWidth: v.optional(v.number()),
  coverHeight: v.optional(v.number()),
})

const EDITION_FORMAT_PRIORITY: Record<string, number> = {
  hardcover: 5,
  paperback: 4,
  board_book: 3,
  library_binding: 2,
  spiral: 1,
  kindle: 0,
  audiobook: -1,
  unknown: -2,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bookEditionsMutations = (internal as any)['bookEditions/mutations']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bookIdentifiersMutations = (internal as any)['bookIdentifiers/mutations']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bookCoverCandidatesMutations = (internal as any)['bookCoverCandidates/mutations']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bookAuthorsMutations = (internal as any)['bookAuthors/mutations']

type BookIdentifierType = 'asin' | 'isbn10' | 'isbn13'
type ImportedEdition = { editionId: Id<'bookEditions'>; format: string }
type EditionIdentifierInput = {
  asin: string
  amazonUrl: string
  isbn10?: string
  isbn13?: string
}
type EditionCoverInput = {
  amazonUrl: string
  mainCoverUrl?: string
  coverWidth?: number
  coverHeight?: number
}
type BasicBookMetadataInput = {
  bookId: Id<'books'>
  asin?: string
  isbn10?: string
  isbn13?: string
  amazonUrl?: string
  coverImageUrl?: string
  coverWidth?: number
  coverHeight?: number
}
type EditionImportInput = EditionIdentifierInput &
  EditionCoverInput & {
    format: string
  }

// Validator for scraped book data from local Playwright scraper
const scrapedBookDataValidator = v.object({
  title: v.string(),
  subtitle: v.optional(v.string()),
  authors: v.array(v.string()),
  // Amazon author IDs extracted from byline links - used for linking to authors table
  amazonAuthorIds: v.optional(v.array(v.string())),
  // Contributors with roles (Author, Illustrator, etc.)
  contributors: v.optional(
    v.array(
      v.object({
        name: v.string(),
        amazonAuthorId: v.optional(v.string()),
        role: v.string(),
      }),
    ),
  ),
  isbn10: v.optional(v.string()),
  isbn13: v.optional(v.string()),
  asin: v.optional(v.string()),
  amazonUrl: v.optional(v.string()),
  publisher: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  description: v.optional(v.string()),
  coverImageUrl: v.optional(v.string()),
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
  seriesName: v.optional(v.string()),
  seriesUrl: v.optional(v.string()),
  seriesPosition: v.optional(v.number()),
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
  // Per-edition data (optional - populated when edition pages are scraped)
  editions: v.optional(v.array(editionDataValidator)),
})

/**
 * Public action for importing book data from local Playwright scraper.
 * Requires SCRAPE_IMPORT_KEY environment variable for authentication.
 */
export const importFromLocalScrape = action({
  args: {
    scrapedData: scrapedBookDataValidator,
    apiKey: v.string(),
    skipCoverDownload: v.optional(v.boolean()),
    firstSeenFromUrl: v.optional(v.string()),
    firstSeenReason: v.optional(v.string()),
  },
  handler: async (context, args): Promise<{ bookId: Id<'books'>; isNew: boolean }> => {
    // Validate API key
    const expectedKey = process.env.SCRAPE_IMPORT_KEY
    if (!expectedKey) {
      throw new Error('SCRAPE_IMPORT_KEY environment variable is not configured')
    }

    if (args.apiKey !== expectedKey) {
      throw new Error('Invalid API key')
    }

    console.log('🏁 Importing book from local scrape', { title: args.scrapedData.title })

    // Store the produced object offline for debugging/version comparisons
    await context.runMutation(internal.scraping.artifacts.create, {
      entityType: 'book',
      sourceUrl: args.scrapedData.amazonUrl ?? '(unknown)',
      adapter: 'playwright-local',
      scrapeVersion: SCRAPE_VERSIONS.book,
      payloadJson: JSON.stringify(args.scrapedData),
    })

    // Resolve series FIRST to enable title-within-series dedup
    // This prevents duplicates when book ASIN changes due to format upgrade (e.g., paperback → hardcover)
    let seriesId: Id<'series'> | undefined
    if (args.scrapedData.seriesUrl && args.scrapedData.seriesName) {
      seriesId = await context.runMutation(internal.series.mutations.upsert, {
        name: args.scrapedData.seriesName,
        source: 'amazon',
        sourceUrl: args.scrapedData.seriesUrl,
        firstSeenFromUrl: args.firstSeenFromUrl ?? args.scrapedData.amazonUrl,
        firstSeenReason: args.firstSeenReason ?? 'book-series-link',
      })
    }

    // Create or update book using unified mutation
    const result = await context.runMutation(internal.books.internal.createOrUpdate, {
      title: args.scrapedData.title,
      subtitle: args.scrapedData.subtitle,
      authors: args.scrapedData.authors,
      amazonAuthorIds: args.scrapedData.amazonAuthorIds,
      contributors: args.scrapedData.contributors,
      asin: args.scrapedData.asin,
      amazonUrl: args.scrapedData.amazonUrl,
      seriesId, // Pass seriesId to enable title-within-series dedup
      seriesName: args.scrapedData.seriesName,
      seriesUrl: args.scrapedData.seriesUrl,
      seriesPosition: args.scrapedData.seriesPosition,
      publisher: args.scrapedData.publisher,
      publishedDate: args.scrapedData.publishedDate,
      pageCount: args.scrapedData.pageCount,
      description: args.scrapedData.description,
      coverSourceUrl: args.scrapedData.coverImageUrl,
      coverWidth: args.scrapedData.coverWidth,
      coverHeight: args.scrapedData.coverHeight,
      coverSourceFormat: args.scrapedData.coverSourceFormat,
      coverSourceAsin: args.scrapedData.coverSourceAsin,
      lexileScore: args.scrapedData.lexileScore,
      ageRangeMin: args.scrapedData.ageRangeMin,
      ageRangeMax: args.scrapedData.ageRangeMax,
      ageRange: args.scrapedData.ageRange,
      gradeLevelMin: args.scrapedData.gradeLevelMin,
      gradeLevelMax: args.scrapedData.gradeLevelMax,
      gradeLevel: args.scrapedData.gradeLevel,
      amazonRatingAverage: args.scrapedData.amazonRatingAverage,
      amazonRatingCount: args.scrapedData.amazonRatingCount,
      goodreadsRatingAverage: args.scrapedData.goodreadsRatingAverage,
      goodreadsRatingCount: args.scrapedData.goodreadsRatingCount,
      ratingScore: args.scrapedData.ratingScore,
      source: 'playwright-local',
      scrapeVersion: SCRAPE_VERSIONS.book,
      detailsStatus: 'complete',
      coverStatus: args.scrapedData.coverImageUrl ? 'pending' : 'error',
      firstSeenFromUrl: args.firstSeenFromUrl,
      firstSeenReason: args.firstSeenReason,
    })

    const { bookId, isNew, coverSourceUrlChanged } = result

    console.log('✅ Book imported', { bookId, isNew, title: args.scrapedData.title })

    const authorLinkResult = await context.runMutation(bookAuthorsMutations.linkExistingAuthorsForBook, {
      bookId,
      authorNames: args.scrapedData.authors,
      amazonAuthorIds: args.scrapedData.amazonAuthorIds,
      contributors: args.scrapedData.contributors,
    })

    if (authorLinkResult.linkedCount > 0) {
      console.log('🔗 Linked book to existing authors', {
        bookId,
        linkedCount: authorLinkResult.linkedCount,
        matchedAuthorCount: authorLinkResult.matchedAuthorCount,
      })
    }

    // Schedule cover download if we have a URL
    if (args.scrapedData.coverImageUrl && !args.skipCoverDownload) {
      // Download cover if: new book, or coverSourceUrl changed
      const needsCover = isNew || coverSourceUrlChanged

      if (needsCover) {
        await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
          bookId,
          sourceUrl: args.scrapedData.coverImageUrl,
        })
      }
    }

    // Link book to series (series was already resolved above for dedup)
    if (seriesId) {
      console.log('🔗 Linking book to series', { seriesName: args.scrapedData.seriesName })

      await context.runMutation(internal.series.mutations.linkBook, {
        bookId,
        seriesId,
        seriesPosition: args.scrapedData.seriesPosition,
      })
    }

    if (args.scrapedData.editions && args.scrapedData.editions.length > 0) {
      console.log('📖 Upserting editions and identifiers...', { editionCount: args.scrapedData.editions.length })
      const primaryEditionId = await upsertBookEditions(context, {
        bookId,
        editions: args.scrapedData.editions,
        publisher: args.scrapedData.publisher,
      })

      if (primaryEditionId) {
        await context.runMutation(internal.books.mutations.setPrimaryEdition, {
          bookId,
          primaryEditionId,
        })
      }

      // Denormalize publisher name to books from primary edition
      if (primaryEditionId && args.scrapedData.publisher) {
        await context.runMutation(internal.books.mutations.updatePublisher, {
          bookId,
          publisher: args.scrapedData.publisher,
        })
      }

      console.log('✅ Editions and identifiers upserted')
    } else {
      await upsertBasicBookMetadata(context, {
        bookId,
        asin: args.scrapedData.asin,
        isbn10: args.scrapedData.isbn10,
        isbn13: args.scrapedData.isbn13,
        amazonUrl: args.scrapedData.amazonUrl,
        coverImageUrl: args.scrapedData.coverImageUrl,
        coverWidth: args.scrapedData.coverWidth,
        coverHeight: args.scrapedData.coverHeight,
      })
    }

    return { bookId, isNew }
  },
})

function pickPrimaryEditionId(
  editions: ImportedEdition[],
): Id<'bookEditions'> | undefined {
  if (editions.length === 0) return undefined

  const sortedEditions = [...editions].sort((left, right) => {
    const leftPriority = EDITION_FORMAT_PRIORITY[left.format] ?? EDITION_FORMAT_PRIORITY.unknown
    const rightPriority = EDITION_FORMAT_PRIORITY[right.format] ?? EDITION_FORMAT_PRIORITY.unknown
    return rightPriority - leftPriority
  })

  return sortedEditions[0]?.editionId
}

async function upsertBookEditions(
  context: ActionCtx,
  params: {
    bookId: Id<'books'>
    editions: EditionImportInput[]
    publisher?: string
  },
): Promise<Id<'bookEditions'> | undefined> {
  const publisherId = await upsertPublisherIfNeeded(context, params.publisher)
  const importedEditions: ImportedEdition[] = []

  for (const edition of params.editions) {
    const editionId = await context.runMutation(bookEditionsMutations.upsert, {
      bookId: params.bookId,
      source: 'amazon',
      sourceId: edition.asin,
      sourceUrl: edition.amazonUrl,
      format: edition.format,
      isbn10: edition.isbn10 ?? undefined,
      isbn13: edition.isbn13 ?? undefined,
      mainCoverUrl: edition.mainCoverUrl ?? undefined,
      publisherId,
    })

    importedEditions.push({ editionId, format: edition.format })
    await upsertEditionIdentifiers(context, params.bookId, editionId, edition)
    await upsertEditionCoverCandidate(context, params.bookId, editionId, edition)
  }

  return pickPrimaryEditionId(importedEditions)
}

async function upsertPublisherIfNeeded(context: ActionCtx, publisher?: string): Promise<Id<'publishers'> | undefined> {
  if (!publisher) return undefined

  return await context.runMutation(internal.publishers.mutations.upsertByName, {
    name: publisher,
  })
}

async function upsertEditionIdentifiers(
  context: ActionCtx,
  bookId: Id<'books'>,
  editionId: Id<'bookEditions'>,
  edition: EditionIdentifierInput,
): Promise<void> {
  await upsertBookIdentifier(context, {
    bookId,
    type: 'asin',
    value: edition.asin,
    sourceUrl: edition.amazonUrl,
    editionId,
  })
  await upsertBookIdentifier(context, {
    bookId,
    type: 'isbn10',
    value: edition.isbn10,
    sourceUrl: edition.amazonUrl,
    editionId,
  })
  await upsertBookIdentifier(context, {
    bookId,
    type: 'isbn13',
    value: edition.isbn13,
    sourceUrl: edition.amazonUrl,
    editionId,
  })
}

async function upsertEditionCoverCandidate(
  context: ActionCtx,
  bookId: Id<'books'>,
  editionId: Id<'bookEditions'>,
  edition: EditionCoverInput,
): Promise<void> {
  if (!edition.mainCoverUrl) return

  await context.runMutation(bookCoverCandidatesMutations.upsert, {
    bookId,
    editionId,
    imageUrl: edition.mainCoverUrl,
    width: edition.coverWidth ?? undefined,
    height: edition.coverHeight ?? undefined,
    source: 'amazon',
    sourceUrl: edition.amazonUrl,
    isPrimary: true,
  })
}

async function upsertBasicBookMetadata(
  context: ActionCtx,
  params: BasicBookMetadataInput,
): Promise<void> {
  await upsertBookIdentifier(context, {
    bookId: params.bookId,
    type: 'asin',
    value: params.asin,
    sourceUrl: params.amazonUrl,
  })
  await upsertBookIdentifier(context, {
    bookId: params.bookId,
    type: 'isbn10',
    value: params.isbn10,
    sourceUrl: params.amazonUrl,
  })
  await upsertBookIdentifier(context, {
    bookId: params.bookId,
    type: 'isbn13',
    value: params.isbn13,
    sourceUrl: params.amazonUrl,
  })

  if (!params.coverImageUrl) return

  await context.runMutation(bookCoverCandidatesMutations.upsert, {
    bookId: params.bookId,
    imageUrl: params.coverImageUrl,
    width: params.coverWidth ?? undefined,
    height: params.coverHeight ?? undefined,
    source: 'amazon',
    sourceUrl: params.amazonUrl,
    isPrimary: true,
  })
}

async function upsertBookIdentifier(
  context: ActionCtx,
  params: {
    bookId: Id<'books'>
    type: BookIdentifierType
    value: string | undefined
    sourceUrl: string | undefined
    editionId?: Id<'bookEditions'>
  },
): Promise<void> {
  if (!params.value || !params.sourceUrl) return

  await context.runMutation(bookIdentifiersMutations.upsert, {
    bookId: params.bookId,
    type: params.type,
    value: params.value,
    editionId: params.editionId,
    source: 'amazon',
    sourceUrl: params.sourceUrl,
  })
}
