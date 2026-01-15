import { action } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { extractAsin, normalizeAmazonUrl } from './adapters/amazon/url'

/**
 * Scrape a series page and create discoveries for found books.
 * This is the main orchestrator for series scraping.
 */
type ScrapeSeriesResult = {
  booksFound: number
  pending: number
  skipped: number
  hasMorePages: boolean
}

export const scrapeSeries = action({
  args: {
    seriesId: v.id('series'),
    pageUrl: v.optional(v.string()), // For pagination - scrape specific page
  },
  handler: async (context, args): Promise<ScrapeSeriesResult> => {
    console.log('🏁 Starting series scrape', { seriesId: args.seriesId })

    // Get series data
    const series = await context.runQuery(internal.series.queries.getInternal, {
      id: args.seriesId,
    })

    if (!series) {
      throw new Error('Series not found')
    }

    const urlToScrape = args.pageUrl ?? series.sourceUrl
    if (!urlToScrape) {
      throw new Error('No sourceUrl for series')
    }

    // Create scrape run for audit trail
    const runId = await context.runMutation(internal.series.mutations.createScrapeRun, {
      seriesId: args.seriesId,
      adapter: 'amazon',
      sourceUrl: urlToScrape,
    })

    // Update series status to processing
    await context.runMutation(internal.series.mutations.updateStatus, {
      seriesId: args.seriesId,
      scrapeStatus: 'processing',
      lastAttemptedAt: Date.now(),
    })

    try {
      // Call the Amazon adapter
      const data = await context.runAction(
        internal.scraping.adapters.amazon.series.crawlSeriesWithAmazon,
        { url: urlToScrape }
      )

      if (!data.seriesName || !data.books?.length) {
        throw new Error('Invalid series data: missing name or books')
      }

      // Check existing books in DB to determine skipped vs pending
      let pendingCount = 0
      let skippedCount = 0

      for (const book of data.books) {
        const asin = book.asin ?? extractAsin(book.amazonUrl)
        const normalizedUrl = normalizeAmazonUrl(book.amazonUrl)

        // Check if book already exists in DB by ASIN
        let existingBook = null
        if (asin) {
          const books = await context.runQuery(internal.books.queries.findByAsin, { asin })
          existingBook = books
        }

        const status = existingBook ? 'skipped' : 'pending'
        if (status === 'skipped') {
          skippedCount++
          // Link existing book to series if not already linked
          if (existingBook && !existingBook.seriesId) {
            await context.runMutation(internal.series.mutations.linkBook, {
              bookId: existingBook._id,
              seriesId: args.seriesId,
              seriesPosition: book.position,
            })
          }
        } else {
          pendingCount++
        }

        // Create discovery record
        await context.runMutation(internal.series.mutations.createDiscovery, {
          seriesId: args.seriesId,
          source: 'amazon',
          sourceUrl: book.amazonUrl,
          sourceId: asin ?? undefined,
          normalizedUrl,
          title: book.title,
          position: book.position,
          status,
          bookId: existingBook?._id,
        })
      }

      console.log('✅ Series scrape complete', {
        seriesId: args.seriesId,
        booksFound: data.books.length,
        pending: pendingCount,
        skipped: skippedCount,
      })

      // Update series with results
      await context.runMutation(internal.series.mutations.updateFromScrape, {
        seriesId: args.seriesId,
        name: data.seriesName,
        description: data.description,
        coverSourceUrl: data.coverImageUrl,
        expectedBookCount: data.expectedBookCount,
        discoveredBookCount: data.books.length,
        lastScrapedPage: data.pagination?.currentPage,
        totalPages: data.pagination?.totalPages,
        nextPageUrl: data.pagination?.nextPageUrl,
      })

      // Complete the scrape run
      await context.runMutation(internal.series.mutations.completeScrapeRun, {
        runId,
        extracted: {
          seriesName: data.seriesName,
          expectedBookCount: data.expectedBookCount,
          booksFound: data.books.length,
          coverUrl: data.coverImageUrl,
        },
      })

      return {
        booksFound: data.books.length,
        pending: pendingCount,
        skipped: skippedCount,
        hasMorePages: !!data.pagination?.nextPageUrl,
      }
    } catch (error) {
      console.log('🚨 Series scrape failed', { seriesId: args.seriesId, error })

      // Update series status to error
      await context.runMutation(internal.series.mutations.updateStatus, {
        seriesId: args.seriesId,
        scrapeStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })

      // Fail the scrape run
      await context.runMutation(internal.series.mutations.failScrapeRun, {
        runId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })

      throw error
    }
  },
})

/**
 * Scrape a single discovered book and link it to the series.
 */
export const scrapeDiscovery = action({
  args: {
    discoveryId: v.id('seriesBookDiscoveries'),
  },
  handler: async (context, args): Promise<{ bookId: Id<'books'> }> => {
    console.log('🏁 Scraping discovery', { discoveryId: args.discoveryId })

    // Get discovery
    const discovery = await context.runQuery(internal.series.queries.getDiscovery, {
      id: args.discoveryId,
    })

    if (!discovery) {
      throw new Error('Discovery not found')
    }

    if (discovery.status !== 'pending') {
      throw new Error(`Discovery already processed: ${discovery.status}`)
    }

    try {
      // Scrape the book using existing crawlBook action
      const bookId = await context.runAction(api.scraping.crawlBook.crawlBook, {
        url: discovery.sourceUrl,
      })

      // Link book to series
      await context.runMutation(internal.series.mutations.linkBook, {
        bookId,
        seriesId: discovery.seriesId,
        seriesPosition: discovery.position,
      })

      // Update discovery
      await context.runMutation(internal.series.mutations.updateDiscovery, {
        discoveryId: args.discoveryId,
        status: 'complete',
        bookId,
      })

      console.log('✅ Discovery scraped', { discoveryId: args.discoveryId, bookId })

      return { bookId }
    } catch (error) {
      console.log('🚨 Discovery scrape failed', { discoveryId: args.discoveryId, error })

      await context.runMutation(internal.series.mutations.updateDiscovery, {
        discoveryId: args.discoveryId,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })

      throw error
    }
  },
})
