import type { Page } from 'playwright'
import { parseAuthorFromPage } from '@/lib/scraping/domains/author/parse'
import { discoverAuthorLinks } from '@/lib/scraping/domains/author/discover'
import { navigateWithRetry } from '../browser'
import { truncate, incrementScrapingCount, log } from '../utils'
import { getConvexClient, markQueueItemComplete, markQueueItemError, queueDiscoveries, type QueueItem, type Id } from '../convex'
import { api } from '@/convex/_generated/api'

type ProcessAuthorResult = {
  success: boolean
  authorId?: string
  seriesAdded?: number
  booksLinked?: number
}

/**
 * Process an author URL from the queue.
 * Scrapes the author page and discovers series to add to queue.
 */
export async function processAuthorFromQueue(params: { item: QueueItem; page: Page; dryRun: boolean }): Promise<ProcessAuthorResult> {
  const { item, page, dryRun } = params

  log('─'.repeat(60))
  log(`👤 Processing author: ${truncate(item.url, 60)}`)
  log('─'.repeat(60))

  // Navigate to author page
  const navResult = await navigateWithRetry({ page, url: item.url })
  if (!navResult.success) {
    if (!dryRun) {
      await markQueueItemError(item._id, 'Navigation failed')
    }
    return { success: false }
  }

  // Parse author data
  const authorData = await parseAuthorFromPage(page)

  if (!authorData.name) {
    log(`   ⚠️ Failed to extract author name`)
    if (!dryRun) {
      await markQueueItemError(item._id, 'Failed to extract author name')
    }
    return { success: false }
  }

  if (!authorData.amazonAuthorId) {
    log(`   ⚠️ Failed to extract Amazon author ID`)
    if (!dryRun) {
      await markQueueItemError(item._id, 'Failed to extract Amazon author ID')
    }
    return { success: false }
  }

  log(`   ✅ Parsed: ${authorData.name}`)
  log(`   Amazon ID: ${authorData.amazonAuthorId}`)
  log(`   Image URL: ${authorData.imageUrl ?? 'None'}`)
  log(`   Bio: ${authorData.bio ? `${authorData.bio.substring(0, 50)}...` : 'None'}`)
  log(`   Series found: ${authorData.series.length}`)
  log(`   Books found: ${authorData.books.length}`)

  if (dryRun) {
    log(`   🏁 Would import (dry run)`)
    return { success: true }
  }

  // Import author to Convex
  const apiKey = process.env.SCRAPE_IMPORT_KEY
  if (!apiKey) {
    throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
  }

  const client = getConvexClient()

  // Backfill queue preview metadata for user-enqueued items (discovery items already include it).
  if (item.source === 'user') {
    await client.mutation(api.scrapeQueue.mutations.updatePreview, {
      queueId: item._id,
      displayName: authorData.name ?? undefined,
      displayImageUrl: authorData.imageUrl ?? undefined,
    })
  }

  let authorId: Id<'authors'>
  let booksLinked = 0

  try {
    const importResult = await client.action(api.scraping.importAuthor.importFromLocalScrape, {
      authorData: {
        name: authorData.name,
        bio: authorData.bio ?? undefined,
        amazonAuthorId: authorData.amazonAuthorId,
        sourceUrl: item.url,
        imageUrl: authorData.imageUrl ?? undefined,
      },
      apiKey,
      firstSeenFromUrl: item.referrerUrl,
      firstSeenReason: item.referrerReason,
    })

    authorId = importResult.authorId
    booksLinked = importResult.booksLinked
    log(`   ✅ Imported: ${authorId} (new: ${importResult.isNew}, books linked: ${booksLinked})`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log(`   🚨 Import failed: ${message}`)
    await markQueueItemError(item._id, message)
    return { success: false }
  }

  // Extract discoveries and queue them (respecting skip options)
  // For authors, skipBookDiscoveries means "don't queue any new series/books from this author"
  // TEMPORARILY DISABLED: All queueing is deactivated for author scraping
  // TODO: Re-enable when needed
  /*
  const skipDiscoveries = item.skipBookDiscoveries

  let seriesAdded = 0

  if (skipDiscoveries) {
    log(`   ⏭️ Skipping discoveries (skipBookDiscoveries=true)`)
  } else {
    const discoveries = discoverAuthorLinks(authorData)

    if (discoveries.length > 0) {
      log(`   🔗 Found ${discoveries.length} discoveries:`)
      const seriesCount = discoveries.filter((d) => d.type === 'series').length
      const bookCount = discoveries.filter((d) => d.type === 'book').length
      log(`      - ${seriesCount} series, ${bookCount} books`)

      if (!dryRun) {
        const queued = await queueDiscoveries(discoveries, item.url)
        log(`   ✅ Queued ${queued} discoveries`)
      }

      seriesAdded = seriesCount
    }
  }
  */

  // Queueing disabled - set seriesAdded to 0
  let seriesAdded = 0
  log(`   ⏭️ Queueing disabled (all discoveries skipped)`)

  // Mark queue item complete
  await markQueueItemComplete({
    queueId: item._id,
    authorId,
  })

  incrementScrapingCount()

  log('─'.repeat(60))
  log('')

  return { success: true, authorId, seriesAdded, booksLinked }
}
