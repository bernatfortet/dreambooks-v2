import type { Page } from 'playwright'
import { parseBookFromPage, ensurePreferredFormat } from '../../../lib/scraping/domains/book/parse'
import { discoverBookLinks } from '../../../lib/scraping/domains/book/discover'
import { detectAmazonPageType } from '../../../lib/scraping/utils/page-type-detector'
import { navigateWithRetry } from '../browser'
import { truncate, incrementScrapingCount } from '../utils'
import { importBookToConvex } from '../../lib/convex-client'
import {
  markQueueItemComplete,
  markQueueItemError,
  queueDiscoveries,
  requeueAsType,
  type QueueItem,
  type Id,
} from '../convex'

type ProcessBookResult = {
  success: boolean
  bookId?: string
}

/**
 * Process a book URL from the queue.
 * Optionally scrapes the full series and all books in it.
 */
export async function processBookFromQueue(params: {
  item: QueueItem
  page: Page
  dryRun: boolean
}): Promise<ProcessBookResult> {
  const { item, page, dryRun } = params

  console.log(`📖 Processing book: ${truncate(item.url, 60)}`)

  // Navigate to book page
  const navResult = await navigateWithRetry({ page, url: item.url })
  if (!navResult.success) {
    if (!dryRun) {
      await markQueueItemError(item._id, 'Navigation failed')
    }
    return { success: false }
  }

  // Upgrade to preferred format if available (hardcover > paperback > kindle)
  await ensurePreferredFormat(page)

  // Parse book data
  const bookData = await parseBookFromPage(page)

  if (!bookData.title) {
    console.log(`   ⚠️ Failed to extract title, checking if page is a series...`)

    // Check if this is actually a series page
    const pageType = await detectAmazonPageType(page)

    if (pageType === 'series') {
      console.log(`   🔄 Detected series page, re-queuing as series`)
      if (!dryRun) {
        await requeueAsType({
          currentQueueId: item._id,
          url: item.url,
          newType: 'series',
          priority: 20,
        })
      }
      return { success: false }
    }

    console.log(`   ⚠️ Page type: ${pageType}, marking as error`)
    if (!dryRun) {
      await markQueueItemError(item._id, 'Failed to extract title')
    }
    return { success: false }
  }

  console.log(`   ✅ Parsed: ${bookData.title}`)
  console.log(`   Authors: ${bookData.authors?.join(', ') ?? 'Unknown'}`)

  if (dryRun) {
    console.log(`   🏁 Would import (dry run)`)
    return { success: true }
  }

  // Import book
  if (!bookData.authors?.length) {
    console.log(`   ⚠️ No authors found`)
    await markQueueItemError(item._id, 'No authors found')
    return { success: false }
  }

  let bookId: string

  try {
    const importResult = await importBookToConvex({
      scrapedData: bookData,
      amazonUrl: item.url,
    })

    bookId = importResult.bookId
    console.log(`   ✅ Imported: ${bookId} (new: ${importResult.isNew})`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.log(`   🚨 Import failed: ${message}`)
    await markQueueItemError(item._id, message)
    return { success: false }
  }

  // Extract discoveries and queue them
  const discoveries = discoverBookLinks(bookData)

  if (discoveries.length > 0) {
    console.log(`   🔗 Found ${discoveries.length} discoveries:`)
    for (const discovery of discoveries) {
      console.log(`      - ${discovery.type}: ${truncate(discovery.url, 50)}`)
    }

    if (!dryRun) {
      const queued = await queueDiscoveries(discoveries)
      console.log(`   ✅ Queued ${queued} discoveries`)
    }
  }

  // Mark queue item complete
  await markQueueItemComplete({
    queueId: item._id,
    bookId: bookId as Id<'books'>,
  })

  incrementScrapingCount()

  return { success: true, bookId }
}
