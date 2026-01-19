import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'

export const crawlBook = action({
  args: {
    url: v.string(),
    adapter: v.optional(v.union(v.literal('amazon'))),
  },
  handler: async (context, args): Promise<Id<'books'>> => {
    const adapter = args.adapter ?? 'amazon'

    console.log('🏁 Starting book crawl', { url: args.url, adapter })

    // Create scrape run for traceability
    const scrapeRunId = await context.runMutation(internal.scraping.scrapeRuns.create, {
      url: args.url,
      adapter,
      startedAt: Date.now(),
    })

    try {
      // Step 1: Extract data using adapter
      let bookData
      if (adapter === 'amazon') {
        bookData = await context.runAction(internal.scraping.adapters.amazon.book.crawlBookWithAmazon, { url: args.url })
      }

      // Step 2: Validate required fields
      if (!bookData?.title || !bookData?.authors?.length) {
        throw new Error('Missing required fields: title and authors')
      }

      if (!bookData?.asin && !bookData?.isbn13 && !bookData?.coverImageUrl) {
        throw new Error('Missing identifiers and cover image URL')
      }

      // Mark scrape run complete with extracted summary
      await context.runMutation(internal.scraping.scrapeRuns.complete, {
        scrapeRunId,
        extracted: {
          title: bookData.title,
          authors: bookData.authors,
          asin: bookData.asin,
          isbn10: bookData.isbn10,
          isbn13: bookData.isbn13,
          coverImageUrl: bookData.coverImageUrl,
        },
        finishedAt: Date.now(),
      })

      // Step 3: Save to database (idempotent upsert by asin/isbn13)
      // Convert null to undefined (Convex validators don't accept null)
      const bookId: Id<'books'> = await context.runMutation(internal.books.mutations.upsertFromScrape, {
        title: bookData.title,
        subtitle: bookData.subtitle ?? undefined,
        authors: bookData.authors,
        isbn10: bookData.isbn10 ?? undefined,
        isbn13: bookData.isbn13 ?? undefined,
        asin: bookData.asin ?? undefined,
        amazonUrl: args.url,
        // Series (raw scraped data)
        seriesName: bookData.seriesName ?? undefined,
        seriesUrl: bookData.seriesUrl ?? undefined,
        seriesPosition: bookData.seriesPosition ?? undefined,
        // Details
        publisher: bookData.publisher ?? undefined,
        publishedDate: bookData.publishedDate ?? undefined,
        pageCount: bookData.pageCount ?? undefined,
        description: bookData.description ?? undefined,
        coverSourceUrl: bookData.coverImageUrl ?? undefined,
        lexileScore: bookData.lexileScore ?? undefined,
        ageRange: bookData.ageRange ?? undefined,
        gradeLevel: bookData.gradeLevel ?? undefined,
        source: adapter,
        detailsStatus: 'complete',
        coverStatus: bookData.coverImageUrl ? 'pending' : 'error',
        scrapedAt: Date.now(),
      })

      console.log('✅ Book saved', { bookId, title: bookData.title })

      // Step 4: If book has series info, upsert series and link
      if (bookData.seriesUrl && bookData.seriesName) {
        console.log('🔗 Linking book to series', { seriesName: bookData.seriesName })

        const seriesId = await context.runMutation(internal.series.mutations.upsert, {
          name: bookData.seriesName,
          source: 'amazon',
          sourceUrl: bookData.seriesUrl,
        })

        await context.runMutation(internal.series.mutations.linkBook, {
          bookId,
          seriesId,
          seriesPosition: bookData.seriesPosition ?? undefined,
        })
      }

      // Step 5: Schedule cover download if we have a URL
      if (bookData.coverImageUrl) {
        await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
          bookId,
          sourceUrl: bookData.coverImageUrl,
        })
      }

      return bookId
    } catch (error) {
      console.log('🚨 Book crawl failed', { url: args.url, error })

      // Mark scrape run as failed
      await context.runMutation(internal.scraping.scrapeRuns.fail, {
        scrapeRunId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        finishedAt: Date.now(),
      })

      throw error
    }
  },
})
