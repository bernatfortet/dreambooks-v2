import type { Page } from 'playwright'
import { parseSeriesFromPage } from '@/lib/scraping/domains/series/parse'
import { discoverSeriesLinks } from '@/lib/scraping/domains/series/discover'
import { normalizeSeriesUrlForScraping } from '@/lib/scraping/utils/amazon-url'
import { SCRAPE_VERSIONS } from '@/lib/scraping/config'
import { navigateWithRetry } from '../browser'
import { truncate, incrementScrapingCount, log } from '../utils'
import {
  getConvexClient,
  markQueueItemComplete,
  markQueueItemError,
  queueDiscoveries,
  saveSeriesFromScrape,
  type QueueItem,
  type Id,
} from '../convex'
import { api } from '@/convex/_generated/api'

type ProcessSeriesResult = {
  success: boolean
  seriesId?: string
  booksProcessed?: number
}

type ProcessSeriesParams = {
  item:
    | QueueItem
    | {
        _id: Id<'series'>
        url: string
        type: 'series'
        scrapeFullSeries: boolean
        priority: number
        createdAt: number
        skipBookDiscoveries?: boolean
        skipCoverDownload?: boolean
      }
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

  // Force paperback format for consistent ASINs (prevents duplicates from format variations)
  const normalizedUrl = normalizeSeriesUrlForScraping(item.url)

  log('─'.repeat(60))
  log(`📚 Processing series: ${truncate(normalizedUrl, 60)}`)
  log('─'.repeat(60))

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
  const navResult = await navigateWithRetry({ page, url: normalizedUrl })
  if (!navResult.success) {
    await handleError('Navigation failed')
    return { success: false }
  }

  // Parse series data
  const seriesData = await parseSeriesFromPage(page)

  if (!seriesData.name) {
    log(`   ⚠️ Failed to extract series name`)
    await handleError('Failed to extract series name')
    return { success: false }
  }

  // Backfill queue preview metadata for user-enqueued items (discovery items already include it).
  if (isFromQueue && !dryRun) {
    await client.mutation(api.scrapeQueue.mutations.updatePreview, {
      queueId: item._id as Id<'scrapeQueue'>,
      displayName: seriesData.name ?? undefined,
      displayImageUrl: seriesData.coverImageUrl ?? undefined,
    })
  }

  log(`   ✅ Parsed: ${seriesData.name}`)
  log(`   Books found: ${seriesData.books.length}`)
  log(`   Total books: ${seriesData.totalBooks ?? 'Unknown'}`)

  if (dryRun) {
    log(`   🏁 Would save (dry run)`)
    return { success: true, booksProcessed: seriesData.books.length }
  }

  // Create/update series in Convex
  let seriesId: Id<'series'>

  try {
    const referrerUrl = isFromQueue && 'referrerUrl' in item ? item.referrerUrl : undefined
    const referrerReason = isFromQueue && 'referrerReason' in item ? item.referrerReason : undefined

    seriesId =
      existingSeriesId ??
      (await client.mutation(api.series.mutations.upsertFromUrl, {
        name: seriesData.name,
        sourceUrl: item.url,
        description: seriesData.description ?? undefined,
        coverImageUrl: seriesData.coverImageUrl ?? undefined,
        skipCoverDownload: item.skipCoverDownload,
        firstSeenFromUrl: referrerUrl,
        firstSeenReason: referrerReason,
      }))

    // When using existing series ID, ensure cover is scheduled if needed
    // (upsertFromUrl handles this normally, but we skip it when existingSeriesId is provided)
    if (existingSeriesId && seriesData.coverImageUrl && !item.skipCoverDownload) {
      await client.mutation(api.series.mutations.scheduleCoverDownload, {
        seriesId: existingSeriesId,
        coverImageUrl: seriesData.coverImageUrl,
      })
    }

    log(`   ✅ Series created/updated: ${seriesId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log(`   🚨 Failed to create series: ${message}`)
    await handleError(message)
    return { success: false }
  }

  // Extract discoveries and queue them (respecting skip options)
  const skipBookDiscoveries = 'skipBookDiscoveries' in item && item.skipBookDiscoveries

  if (skipBookDiscoveries) {
    log(`   ⏭️ Skipping book discoveries (skipBookDiscoveries=true)`)
  } else {
    const discoveries = discoverSeriesLinks(seriesData)

    if (discoveries.length > 0) {
      log(`   🔗 Found ${discoveries.length} book discoveries`)
      if (!dryRun) {
        const queued = await queueDiscoveries(discoveries, item.url)
        log(`   ✅ Queued ${queued} book discoveries`)
      }
    }
  }

  let booksProcessed = 0

  // Always save series scrape results to set scrapeVersion (prevents version upgrade loop)
  // When scrapeFullSeries=true, books are scraped separately via discoveries
  // When scrapeFullSeries=false, books are created directly from the series page data
  const booksForSave = item.scrapeFullSeries
    ? [] // Books will be scraped separately
    : seriesData.books
        .filter((book) => book.amazonUrl && book.format !== 'audiobook')
        .map((book) => ({
          title: book.title ?? 'Unknown Title',
          amazonUrl: book.amazonUrl!,
          asin: book.asin ?? undefined,
          position: book.position ?? undefined,
          coverImageUrl: book.coverImageUrl ?? undefined,
          authors: book.authors && book.authors.length > 0 ? book.authors : undefined,
        }))

  // Count non-audiobook books as discovered (matches what we'd save if not using scrapeFullSeries)
  const discoveredBookCount = seriesData.books.filter((book) => book.amazonUrl && book.format !== 'audiobook').length

  await saveSeriesFromScrape(seriesId, {
    seriesName: seriesData.name,
    sourceUrl: item.url,
    description: seriesData.description ?? undefined,
    coverImageUrl: seriesData.coverImageUrl ?? undefined,
    expectedBookCount: seriesData.totalBooks ?? undefined,
    discoveredBookCount,
    skipCoverDownload: item.skipCoverDownload,
    scrapeVersion: SCRAPE_VERSIONS.series,
    books: booksForSave,
    pagination: seriesData.pagination
      ? {
          currentPage: seriesData.pagination.currentPage,
          totalPages: seriesData.pagination.totalPages ?? undefined,
          nextPageUrl: seriesData.pagination.nextPageUrl ?? undefined,
        }
      : undefined,
  })

  booksProcessed = booksForSave.length

  // Mark queue item complete (only if from queue)
  if (isFromQueue) {
    await markQueueItemComplete({
      queueId: item._id as Id<'scrapeQueue'>,
      seriesId,
    })
  }

  incrementScrapingCount()

  log('─'.repeat(60))
  log('')

  return { success: true, seriesId: seriesId as string, booksProcessed }
}
