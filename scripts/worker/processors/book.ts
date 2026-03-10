import type { Page } from 'playwright'
import { parseBookFromPage } from '@/lib/scraping/domains/book/parse'
import { discoverBookLinks } from '@/lib/scraping/domains/book/discover'
import { detectAmazonPageType } from '@/lib/scraping/utils/page-type-detector'
import { navigateWithRetry } from '../browser'
import { truncate, incrementScrapingCount, log, isJuvenileBook } from '../utils'
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
export async function processBookFromQueue(params: { item: QueueItem; page: Page; dryRun: boolean }): Promise<ProcessBookResult> {
  const { item, page, dryRun } = params

  log('─'.repeat(60))
  log(`📖 Processing book: ${truncate(item.url, 60)}`)
  log('─'.repeat(60))

  // Navigate to book page (may land on any format: hardcover, paperback, kindle, etc.)
  const navResult = await navigateWithRetry({ page, url: item.url })
  if (!navResult.success) {
    if (!dryRun) {
      await markQueueItemError(item._id, 'Navigation failed')
    }
    return { success: false }
  }

  // Parse book data - edition scraping handles visiting all formats efficiently
  const bookData = await parseBookFromPage(page, { scrapeEditions: true })

  if (!bookData.title) {
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

  // Backfill queue preview metadata for user-enqueued items (discovery items already include it).
  if (!dryRun && item.source === 'user') {
    const client = getConvexClient()
    await client.mutation(api.scrapeQueue.mutations.updatePreview, {
      queueId: item._id,
      displayName: bookData.title ?? undefined,
      displayImageUrl: bookData.coverImageUrl ?? undefined,
    })
  }

  // Only enforce juvenile filter for discoveries.
  // Manual user enqueues should be allowed even when Amazon lacks juvenile signals.
  if (item.source === 'discovery' && !isJuvenileBook(bookData)) {
    log(`   ⏭️ Skipping non-juvenile book (no age/grade/children's category)`)
    if (!dryRun) {
      await markQueueItemError(item._id, "Non-juvenile book (no age/grade/children's category)")
    }
    return { success: false }
  }
  if (item.source === 'user' && !isJuvenileBook(bookData)) {
    log(`   ⚠️ No juvenile signals (age/grade/children's category), but importing (manual enqueue)`)
  }

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

  // Extract discoveries and queue them (respecting skip options)
  let discoveries = discoverBookLinks(bookData)

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
}
