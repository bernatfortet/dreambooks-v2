'use node'

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'

// Validator for scraped book data from local Playwright scraper
const scrapedBookDataValidator = v.object({
  title: v.string(),
  subtitle: v.optional(v.string()),
  authors: v.array(v.string()),
  // Amazon author IDs extracted from byline links - used for linking to authors table
  amazonAuthorIds: v.optional(v.array(v.string())),
  isbn10: v.optional(v.string()),
  isbn13: v.optional(v.string()),
  asin: v.optional(v.string()),
  amazonUrl: v.optional(v.string()),
  publisher: v.optional(v.string()),
  publishedDate: v.optional(v.string()),
  pageCount: v.optional(v.number()),
  description: v.optional(v.string()),
  coverImageUrl: v.optional(v.string()),
  lexileScore: v.optional(v.number()),
  ageRange: v.optional(v.string()),
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
      })
    )
  ),
})

/**
 * Public action for importing book data from local Playwright scraper.
 * Requires SCRAPE_IMPORT_KEY environment variable for authentication.
 */
export const importFromLocalScrape = action({
  args: {
    scrapedData: scrapedBookDataValidator,
    apiKey: v.string(),
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

    // Create or update book using unified mutation
    const result = await context.runMutation(internal.books.internal.createOrUpdate, {
      title: args.scrapedData.title,
      subtitle: args.scrapedData.subtitle,
      authors: args.scrapedData.authors,
      amazonAuthorIds: args.scrapedData.amazonAuthorIds,
      isbn10: args.scrapedData.isbn10,
      isbn13: args.scrapedData.isbn13,
      asin: args.scrapedData.asin,
      amazonUrl: args.scrapedData.amazonUrl,
      seriesName: args.scrapedData.seriesName,
      seriesUrl: args.scrapedData.seriesUrl,
      seriesPosition: args.scrapedData.seriesPosition,
      publisher: args.scrapedData.publisher,
      publishedDate: args.scrapedData.publishedDate,
      pageCount: args.scrapedData.pageCount,
      description: args.scrapedData.description,
      coverSourceUrl: args.scrapedData.coverImageUrl,
      lexileScore: args.scrapedData.lexileScore,
      ageRange: args.scrapedData.ageRange,
      gradeLevel: args.scrapedData.gradeLevel,
      formats: args.scrapedData.formats,
      source: 'playwright-local',
      detailsStatus: 'complete',
      coverStatus: args.scrapedData.coverImageUrl ? 'pending' : 'error',
    })

    const { bookId, isNew } = result

    console.log('✅ Book imported', { bookId, isNew, title: args.scrapedData.title })

    // Schedule cover download if we have a URL and book doesn't already have a cover
    if (args.scrapedData.coverImageUrl) {
      // For new books, always download. For existing books, check if cover is needed
      const needsCover = isNew || await context.runQuery(internal.books.queries.needsCoverDownload, { bookId })

      if (needsCover) {
        await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
          bookId,
          sourceUrl: args.scrapedData.coverImageUrl,
        })
      }
    }

    // If book has series info, upsert series and link
    if (args.scrapedData.seriesUrl && args.scrapedData.seriesName) {
      console.log('🔗 Linking book to series', { seriesName: args.scrapedData.seriesName })

      const seriesId = await context.runMutation(internal.series.mutations.upsert, {
        name: args.scrapedData.seriesName,
        source: 'amazon',
        sourceUrl: args.scrapedData.seriesUrl,
      })

      await context.runMutation(internal.series.mutations.linkBook, {
        bookId,
        seriesId,
        seriesPosition: args.scrapedData.seriesPosition,
      })
    }

    return { bookId, isNew }
  },
})
