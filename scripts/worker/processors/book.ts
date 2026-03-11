import type { Page } from 'playwright'
import { type BookData, isAudioFormat } from '@/lib/scraping/domains/book/types'
import { parseBookFromPage } from '@/lib/scraping/domains/book/parse'
import { classifyBookForReview } from '@/lib/scraping/domains/book/review'
import { discoverBookLinks } from '@/lib/scraping/domains/book/discover'
import { extractAuthorId } from '@/lib/scraping/utils/amazon-url'
import { detectAmazonPageType } from '@/lib/scraping/utils/page-type-detector'
import { type PageManager, isClosedError, navigateWithRetry, reconnectPageForRetry, recoverPageIfClosed } from '../browser'
import { truncate, incrementScrapingCount, log, isJuvenileBook, isEnglishBook } from '../utils'
import { importBookToConvex } from '../../lib/convex-client'
import {
  getConvexClient,
  markQueueItemComplete,
  markQueueItemError,
  queueDiscoveries,
  requeueAsType,
  type QueueItem,
  type Id,
} from '../convex'
import { api } from '@/convex/_generated/api'

type ProcessBookResult = {
  success: boolean
  bookId?: string
}

/**
 * Process a book URL from the queue.
 */
export async function processBookFromQueue(params: {
  item: QueueItem
  page: Page
  pageManager?: PageManager
  dryRun: boolean
}): Promise<ProcessBookResult> {
  const { item, page, dryRun } = params

  log('─'.repeat(60))
  log(`📖 Processing book: ${truncate(item.url, 60)}`)
  log('─'.repeat(60))

  return await processBookAttempt({
    ...params,
    page,
    dryRun,
    attempt: 1,
  })
}

async function processBookAttempt(params: {
  item: QueueItem
  page: Page
  pageManager?: PageManager
  dryRun: boolean
  attempt: number
}): Promise<ProcessBookResult> {
  const { item, page, pageManager, dryRun, attempt } = params

  try {
    // Navigate to book page (may land on any format: hardcover, paperback, kindle, etc.)
    const navResult = await navigateWithRetry({ page, url: item.url })
    if (!navResult.success) {
      const recoveredPage =
        navResult.needsReconnect
          ? await reconnectPageForRetry({
              attempt,
              pageManager,
              reason: 'Page closed during book navigation',
            })
          : null

      if (recoveredPage) {
        return await processBookAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      if (!dryRun) {
        await markQueueItemError(item._id, 'Navigation failed')
      }
      return { success: false }
    }

    // Parse book data - edition scraping handles visiting all formats efficiently
    const bookData = await parseBookFromPage(page, { scrapeEditions: true })

    if (!bookData.title) {
      const recoveredPage = await recoverPageIfClosed({
        attempt,
        page,
        pageManager,
        reason: 'book parsing',
      })

      if (recoveredPage) {
        return await processBookAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      log(`   ⚠️ Failed to extract title, checking if page is a series...`)

      // Check if this is actually a series page
      const pageType = await detectAmazonPageType(page)

      if (pageType === 'series') {
        log(`   🔄 Detected series page, re-queuing as series`)
        if (!dryRun) {
          await requeueAsType({
            currentQueueId: item._id,
            url: item.url,
            newType: 'series',
            priority: 20,
            referrerUrl: item.referrerUrl,
            referrerReason: item.referrerReason,
          })
        }
        return { success: false }
      }

      log(`   ⚠️ Page type: ${pageType}, marking as error`)
      if (!dryRun) {
        await markQueueItemError(item._id, 'Failed to extract title')
      }
      return { success: false }
    }

    log(`   ✅ Parsed: ${bookData.title}`)
    log(`   Authors: ${bookData.authors?.join(', ') ?? 'Unknown'}`)

    const reviewMetadata = classifyBookForReview(bookData)
    if (reviewMetadata.needsReview) {
      log(`   🏷️ Needs review: ${reviewMetadata.reason}`)
    }

    // Backfill queue preview metadata for user-enqueued items (discovery items already include it).
    if (!dryRun && item.source === 'user') {
      const client = getConvexClient()
      await client.mutation(api.scrapeQueue.mutations.updatePreview, {
        queueId: item._id,
        displayName: bookData.title ?? undefined,
        displayImageUrl: bookData.coverImageUrl ?? undefined,
      })
    }

    const discoveryRejection = getDiscoveryRejectionReason(item, bookData)
    if (discoveryRejection) {
      log(`   ⏭️ ${discoveryRejection.logMessage}`)
      if (!dryRun) {
        await markQueueItemError(item._id, discoveryRejection.errorMessage)
      }
      return { success: false }
    }

    logManualImportWarnings(item, bookData)

    if (dryRun) {
      log(`   🏁 Would import (dry run)`)
      return { success: true }
    }

    // Import book
    if (!bookData.authors?.length) {
      log(`   ⚠️ No authors found`)
      await markQueueItemError(item._id, 'No authors found')
      return { success: false }
    }

    let bookId: string

    try {
      const importResult = await importBookToConvex({
        scrapedData: bookData,
        reviewMetadata,
        amazonUrl: item.url,
        skipCoverDownload: item.skipCoverDownload,
        firstSeenFromUrl: item.referrerUrl,
        firstSeenReason: item.referrerReason,
      })

      bookId = importResult.bookId
      log(`   ✅ Imported: ${bookId} (new: ${importResult.isNew})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log(`   🚨 Import failed: ${message}`)
      await markQueueItemError(item._id, message)
      return { success: false }
    }

    let discoveries = getBookDiscoveries(item, bookData)

    // Filter discoveries based on skip options
    if (item.skipSeriesLink) {
      discoveries = discoveries.filter((d) => d.type !== 'series')
      log(`   ⏭️ Skipping series discovery (skipSeriesLink=true)`)
    }
    if (item.skipAuthorDiscovery) {
      discoveries = discoveries.filter((d) => d.type !== 'author')
      log(`   ⏭️ Skipping author discovery (skipAuthorDiscovery=true)`)
    }

    if (discoveries.length > 0) {
      log(`   🔗 Found ${discoveries.length} discoveries:`)
      for (const discovery of discoveries) {
        log(`      - ${discovery.type}: ${truncate(discovery.url, 50)}`)
      }

      if (!dryRun) {
        const queued = await queueDiscoveries(discoveries, item.url)
        log(`   ✅ Queued ${queued} discoveries`)
      }
    } else if (isAuthorPageDiscovery(item)) {
      log(`   ⏭️ Skipping downstream discovery for author-page book`)
    }

    // Mark queue item complete
    await markQueueItemComplete({
      queueId: item._id,
      bookId: bookId as Id<'books'>,
    })

    incrementScrapingCount()

    log('─'.repeat(60))
    log('')

    return { success: true, bookId }
  } catch (error) {
    if (isClosedError(error)) {
      const recoveredPage = await reconnectPageForRetry({
        attempt,
        pageManager,
        reason: 'Page closed while processing book',
      })

      if (recoveredPage) {
        return await processBookAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }
    }

    throw error
  }
}

function getDiscoveryRejectionReason(
  item: QueueItem,
  bookData: Pick<BookData, 'language' | 'formats' | 'amazonAuthorIds'>,
): { logMessage: string; errorMessage: string } | null {
  if (item.source !== 'discovery') return null

  if (!isJuvenileBook(bookData)) {
    return {
      logMessage: "Skipping non-juvenile book (no age/grade/children's category)",
      errorMessage: "Non-juvenile book (no age/grade/children's category)",
    }
  }

  if (!isEnglishBook(bookData)) {
    const language = bookData.language ?? 'unknown'
    return {
      logMessage: `Skipping non-English book (language: ${language})`,
      errorMessage: `Non-English book (language: ${language})`,
    }
  }

  if (isAudiobookOnlyDiscovery(bookData.formats)) {
    return {
      logMessage: 'Skipping audiobook-only discovery',
      errorMessage: 'Audiobook-only discovery',
    }
  }

  if (isAuthorPageDiscovery(item) && !matchesDiscoveryAuthor(item.referrerUrl, bookData.amazonAuthorIds)) {
    return {
      logMessage: 'Skipping book that does not match source author',
      errorMessage: 'Book does not match source author',
    }
  }

  return null
}

function logManualImportWarnings(item: QueueItem, bookData: Pick<BookData, 'language'>): void {
  if (item.source !== 'user') return

  if (!isJuvenileBook(bookData)) {
    log(`   ⚠️ No juvenile signals (age/grade/children's category), but importing (manual enqueue)`)
  }

  if (!isEnglishBook(bookData)) {
    log(`   ⚠️ Language is not explicitly English (${bookData.language ?? 'unknown'}), but importing (manual enqueue)`)
  }
}

function getBookDiscoveries(item: QueueItem, bookData: BookData) {
  if (isAuthorPageDiscovery(item)) return []
  return discoverBookLinks(bookData)
}

function isAuthorPageDiscovery(item: QueueItem): boolean {
  return item.source === 'discovery' && item.referrerReason === 'author-page' && Boolean(item.referrerUrl)
}

function matchesDiscoveryAuthor(referrerUrl: string | undefined, amazonAuthorIds: string[] | undefined): boolean {
  const sourceAuthorId = referrerUrl ? extractAuthorId(referrerUrl) : null
  if (!sourceAuthorId) return true
  if (!amazonAuthorIds?.length) return false

  return amazonAuthorIds.includes(sourceAuthorId)
}

function isAudiobookOnlyDiscovery(formats: Array<{ type: string }> | undefined): boolean {
  if (!formats?.length) return false
  return formats.every((format) => isAudioFormat(format.type))
}

