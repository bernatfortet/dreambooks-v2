import type { Page } from 'playwright'
import { parseSeriesFromPage } from '@/lib/scraping/domains/series/parse'
import { discoverSeriesLinks } from '@/lib/scraping/domains/series/discover'
import { normalizeSeriesUrlForScraping } from '@/lib/scraping/utils/amazon-url'
import { SCRAPE_VERSIONS } from '@/lib/scraping/config'
import { type PageManager, isClosedError, navigateWithRetry, reconnectPageForRetry, recoverPageIfClosed } from '../browser'
import { truncate, incrementScrapingCount, log } from '../utils'
import {
  getConvexClient,
  markQueueItemComplete,
  markQueueItemError,
  queueDiscoveries,
  saveSeriesFromScrape,
  upsertSeriesFromUrl,
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
  pageManager?: PageManager
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

  return await processSeriesAttempt({
    ...params,
    page,
    dryRun,
    normalizedUrl,
    isFromQueue,
    attempt: 1,
  })
}

async function processSeriesAttempt(
  params: ProcessSeriesParams & {
    normalizedUrl: string
    isFromQueue: boolean
    attempt: number
  },
): Promise<ProcessSeriesResult> {
  const {
    item,
    page,
    pageManager,
    dryRun,
    seriesId: existingSeriesId,
    normalizedUrl,
    isFromQueue,
    attempt,
  } = params

  const client = getConvexClient()

  async function handleError(message: string) {
    if (dryRun) return
    if (isFromQueue) {
      await markQueueItemError(item._id as Id<'scrapeQueue'>, message)
      return
    }
    if (!existingSeriesId) return

    await client.mutation(api.series.mutations.markError, {
      seriesId: existingSeriesId,
      errorMessage: message,
    })
  }

  try {
    const navResult = await navigateWithRetry({ page, url: normalizedUrl })
    if (!navResult.success) {
      const recoveredPage =
        navResult.needsReconnect
          ? await reconnectPageForRetry({
              attempt,
              pageManager,
              reason: 'Page closed during series navigation',
            })
          : null

      if (recoveredPage) {
        return await processSeriesAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      await handleError('Navigation failed')
      return { success: false }
    }

    const seriesData = await parseSeriesFromPage(page)

    if (!seriesData.name) {
      const recoveredPage = await recoverPageIfClosed({
        attempt,
        page,
        pageManager,
        reason: 'series parsing',
      })

      if (recoveredPage) {
        return await processSeriesAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      log(`   ⚠️ Failed to extract series name`)
      await handleError('Failed to extract series name')
      return { success: false }
    }

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

    let seriesId: Id<'series'>

    try {
      const referrerUrl = isFromQueue && 'referrerUrl' in item ? item.referrerUrl : undefined
      const referrerReason = isFromQueue && 'referrerReason' in item ? item.referrerReason : undefined

      seriesId =
        existingSeriesId ??
        (await upsertSeriesFromUrl({
          name: seriesData.name,
          sourceUrl: item.url,
          description: seriesData.description ?? undefined,
          coverImageUrl: seriesData.coverImageUrl ?? undefined,
          skipCoverDownload: item.skipCoverDownload,
          firstSeenFromUrl: referrerUrl,
          firstSeenReason: referrerReason,
        }))

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

    const booksForSave = item.scrapeFullSeries
      ? []
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

    const booksProcessed = booksForSave.length

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
  } catch (error) {
    if (isClosedError(error)) {
      const recoveredPage = await reconnectPageForRetry({
        attempt,
        pageManager,
        reason: 'Page closed while processing series',
      })

      if (recoveredPage) {
        return await processSeriesAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }
    }

    throw error
  }
}
