'use node'

import { action } from '../_generated/server'
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
      isbn10: args.scrapedData.isbn10,
      isbn13: args.scrapedData.isbn13,
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
      source: 'playwright-local',
      scrapeVersion: SCRAPE_VERSIONS.book,
      detailsStatus: 'complete',
      coverStatus: args.scrapedData.coverImageUrl ? 'pending' : 'error',
      firstSeenFromUrl: args.firstSeenFromUrl,
      firstSeenReason: args.firstSeenReason,
    })

    const { bookId, isNew, coverSourceUrlChanged } = result

    console.log('✅ Book imported', { bookId, isNew, title: args.scrapedData.title })

    // Schedule cover download if we have a URL
    if (args.scrapedData.coverImageUrl && !args.skipCoverDownload) {
      // Download cover if: new book, or coverSourceUrl changed
      const needsCover = isNew || coverSourceUrlChanged

      // #region agent log
      console.log('[DEBUG] Cover download decision', {
        bookId,
        isNew,
        coverSourceUrlChanged,
        needsCover,
        willDownload: needsCover,
      })
      // #endregion

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

    // Upsert editions, identifiers, and cover candidates if we have edition data
    if (args.scrapedData.editions && args.scrapedData.editions.length > 0) {
      console.log('📖 Upserting editions and identifiers...', { editionCount: args.scrapedData.editions.length })

      // Upsert publisher (same for all editions currently - extracted from main page)
      let publisherId: Id<'publishers'> | undefined
      if (args.scrapedData.publisher) {
        publisherId = await context.runMutation(internal.publishers.mutations.upsertByName, {
          name: args.scrapedData.publisher,
        })
      }

      // Track the primary edition (the first one we upsert - typically the one from the URL)
      let primaryEditionId: Id<'bookEditions'> | undefined

      for (const edition of args.scrapedData.editions) {
        // Upsert edition
        const editionId = await context.runMutation((internal as any).bookEditions.mutations.upsert, {
          bookId,
          source: 'amazon',
          sourceId: edition.asin,
          sourceUrl: edition.amazonUrl,
          format: edition.format,
          isbn10: edition.isbn10 ?? undefined,
          isbn13: edition.isbn13 ?? undefined,
          mainCoverUrl: edition.mainCoverUrl ?? undefined,
          publisherId,
        })

        // First edition becomes primary
        if (!primaryEditionId) {
          primaryEditionId = editionId
        }

        // Upsert identifiers for this edition
        // ASIN
        await context.runMutation((internal as any).bookIdentifiers.mutations.upsert, {
          bookId,
          type: 'asin',
          value: edition.asin,
          editionId,
          source: 'amazon',
          sourceUrl: edition.amazonUrl,
        })

        // ISBN-10
        if (edition.isbn10) {
          await context.runMutation((internal as any).bookIdentifiers.mutations.upsert, {
            bookId,
            type: 'isbn10',
            value: edition.isbn10,
            editionId,
            source: 'amazon',
            sourceUrl: edition.amazonUrl,
          })
        }

        // ISBN-13
        if (edition.isbn13) {
          await context.runMutation((internal as any).bookIdentifiers.mutations.upsert, {
            bookId,
            type: 'isbn13',
            value: edition.isbn13,
            editionId,
            source: 'amazon',
            sourceUrl: edition.amazonUrl,
          })
        }

        // Upsert cover candidate if we have a cover URL
        if (edition.mainCoverUrl) {
          await context.runMutation((internal as any).bookCoverCandidates.mutations.upsert, {
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
      }

      // Set primary edition on the book
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
      // No edition data - still upsert basic identifiers from the main book data
      // This ensures we always have identifier lookup even without edition scraping
      if (args.scrapedData.asin) {
        await context.runMutation((internal as any).bookIdentifiers.mutations.upsert, {
          bookId,
          type: 'asin',
          value: args.scrapedData.asin,
          source: 'amazon',
          sourceUrl: args.scrapedData.amazonUrl,
        })
      }

      if (args.scrapedData.isbn10) {
        await context.runMutation((internal as any).bookIdentifiers.mutations.upsert, {
          bookId,
          type: 'isbn10',
          value: args.scrapedData.isbn10,
          source: 'amazon',
          sourceUrl: args.scrapedData.amazonUrl,
        })
      }

      if (args.scrapedData.isbn13) {
        await context.runMutation((internal as any).bookIdentifiers.mutations.upsert, {
          bookId,
          type: 'isbn13',
          value: args.scrapedData.isbn13,
          source: 'amazon',
          sourceUrl: args.scrapedData.amazonUrl,
        })
      }

      // Upsert cover candidate from main cover
      if (args.scrapedData.coverImageUrl) {
        await context.runMutation((internal as any).bookCoverCandidates.mutations.upsert, {
          bookId,
          imageUrl: args.scrapedData.coverImageUrl,
          width: args.scrapedData.coverWidth ?? undefined,
          height: args.scrapedData.coverHeight ?? undefined,
          source: 'amazon',
          sourceUrl: args.scrapedData.amazonUrl,
          isPrimary: true,
        })
      }
    }

    return { bookId, isNew }
  },
})
