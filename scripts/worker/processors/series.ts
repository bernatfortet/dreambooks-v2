import type { Page } from 'playwright'
import { parseSeriesFromPage } from '../../../lib/scraping/domains/series/parse'
import { discoverSeriesLinks } from '../../../lib/scraping/domains/series/discover'
import { navigateWithRetry } from '../browser'
import { truncate, incrementScrapingCount } from '../utils'
import {
  getConvexClient,
  markQueueItemComplete,
  markQueueItemError,
  queueDiscoveries,
  saveSeriesFromScrape,
  type QueueItem,
  type Id,
} from '../convex'
import { api } from '../../../convex/_generated/api'

type ProcessSeriesResult = {
  success: boolean
  seriesId?: string
  booksProcessed?: number
}

type ProcessSeriesParams = {
  item: QueueItem | { _id: Id<'series'>; url: string; type: 'series'; scrapeFullSeries: boolean; priority: number; createdAt: number }
  page: Page
  dryRun: boolean
  // If provided, this is NOT a real queue item - it's a series being scraped directly
  seriesId?: Id<'series'>
}

/**
 * Process a series URL from the queue or directly.
 * Scrapes the series page and all books in it.
 *
 * When seriesId is provided, this is a direct series scrape (not from queue),
 * and errors should update the series status instead of calling markQueueItemError.
 */
export async function processSeriesFromQueue(params: ProcessSeriesParams): Promise<ProcessSeriesResult> {
  const { item, page, dryRun, seriesId: existingSeriesId } = params
  const isFromQueue = !existingSeriesId

  console.log(`📚 Processing series: ${truncate(item.url, 60)}`)

  const client = getConvexClient()

  // Helper to handle errors appropriately based on source
  async function handleError(message: string) {
    if (dryRun) return
    if (isFromQueue) {
      await markQueueItemError(item._id as Id<'scrapeQueue'>, message)
    } else if (existingSeriesId) {
      await client.mutation(api.series.mutations.markError, {
        seriesId: existingSeriesId,
        errorMessage: message,
      })
    }
  }

  // Navigate to series page
  const navResult = await navigateWithRetry({ page, url: item.url })
  if (!navResult.success) {
    await handleError('Navigation failed')
    return { success: false }
  }

  // Parse series data
  const seriesData = await parseSeriesFromPage(page)

  if (!seriesData.name) {
    console.log(`   ⚠️ Failed to extract series name`)
    await handleError('Failed to extract series name')
    return { success: false }
  }

  console.log(`   ✅ Parsed: ${seriesData.name}`)
  console.log(`   Books found: ${seriesData.books.length}`)
  console.log(`   Total books: ${seriesData.totalBooks ?? 'Unknown'}`)

  if (dryRun) {
    console.log(`   🏁 Would save (dry run)`)
    return { success: true, booksProcessed: seriesData.books.length }
  }

  // Create/update series in Convex
  let seriesId: Id<'series'>

  try {
    seriesId = existingSeriesId ?? await client.mutation(api.series.mutations.upsertFromUrl, {
      name: seriesData.name,
      sourceUrl: item.url,
      description: seriesData.description ?? undefined,
      coverImageUrl: seriesData.coverImageUrl ?? undefined,
    })

    console.log(`   ✅ Series created/updated: ${seriesId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.log(`   🚨 Failed to create series: ${message}`)
    await handleError(message)
    return { success: false }
  }

  // Extract discoveries and queue them
  const discoveries = discoverSeriesLinks(seriesData)

  if (discoveries.length > 0) {
    console.log(`   🔗 Found ${discoveries.length} book discoveries`)
    if (!dryRun) {
      const queued = await queueDiscoveries(discoveries)
      console.log(`   ✅ Queued ${queued} book discoveries`)
    }
  }

  let booksProcessed = 0

  if (!item.scrapeFullSeries) {
    // Just save the series with basic book info (no full scraping)
    await saveSeriesFromScrape(seriesId, {
      seriesName: seriesData.name,
      description: seriesData.description ?? undefined,
      coverImageUrl: seriesData.coverImageUrl ?? undefined,
      expectedBookCount: seriesData.totalBooks ?? undefined,
      books: seriesData.books
        .filter((book) => book.amazonUrl && book.format !== 'audiobook')
        .map((book) => ({
          title: book.title ?? 'Unknown Title',
          amazonUrl: book.amazonUrl!,
          asin: book.asin ?? undefined,
          position: book.position ?? undefined,
          coverImageUrl: book.coverImageUrl ?? undefined,
          authors: book.authors && book.authors.length > 0 ? book.authors : undefined,
        })),
      pagination: seriesData.pagination
        ? {
            currentPage: seriesData.pagination.currentPage,
            totalPages: seriesData.pagination.totalPages ?? undefined,
            nextPageUrl: seriesData.pagination.nextPageUrl ?? undefined,
          }
        : undefined,
    })

    booksProcessed = seriesData.books.length
  }

  // Mark queue item complete (only if from queue)
  if (isFromQueue) {
    await markQueueItemComplete({
      queueId: item._id as Id<'scrapeQueue'>,
      seriesId,
    })
  }

  incrementScrapingCount()

  return { success: true, seriesId: seriesId as string, booksProcessed }
}
