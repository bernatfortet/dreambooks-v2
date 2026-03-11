import type { Page } from 'playwright'
import { parseAuthorFromPage } from '@/lib/scraping/domains/author/parse'
import { discoverAuthorLinks } from '@/lib/scraping/domains/author/discover'
import { type PageManager, isClosedError, navigateWithRetry, reconnectPageForRetry, recoverPageIfClosed } from '../browser'
import { truncate, incrementScrapingCount, log } from '../utils'
import { getConvexClient, markQueueItemComplete, markQueueItemError, queueDiscoveries, type QueueItem, type Id } from '../convex'
import { api } from '@/convex/_generated/api'

type ProcessAuthorResult = {
  success: boolean
  authorId?: string
  booksDiscovered?: number
  booksLinked?: number
}

/**
 * Process an author URL from the queue.
 * Scrapes the author page and optionally discovers that author's books.
 */
export async function processAuthorFromQueue(params: {
  item: QueueItem
  page: Page
  pageManager?: PageManager
  dryRun: boolean
}): Promise<ProcessAuthorResult> {
  const { item, page, dryRun } = params

  log('─'.repeat(60))
  log(`👤 Processing author: ${truncate(item.url, 60)}`)
  log('─'.repeat(60))

  return await processAuthorAttempt({
    ...params,
    page,
    dryRun,
    attempt: 1,
  })
}

async function processAuthorAttempt(params: {
  item: QueueItem
  page: Page
  pageManager?: PageManager
  dryRun: boolean
  attempt: number
}): Promise<ProcessAuthorResult> {
  const { item, page, pageManager, dryRun, attempt } = params

  try {
    // Navigate to author page
    const navResult = await navigateWithRetry({ page, url: item.url })
    if (!navResult.success) {
      const recoveredPage =
        navResult.needsReconnect
          ? await reconnectPageForRetry({
              attempt,
              pageManager,
              reason: 'Page closed during author navigation',
            })
          : null

      if (recoveredPage) {
        return await processAuthorAttempt({
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

    // Parse author data
    const authorData = await parseAuthorFromPage(page)

    if (!authorData.name) {
      const recoveredPage = await recoverPageIfClosed({
        attempt,
        page,
        pageManager,
        reason: 'author parsing',
      })

      if (recoveredPage) {
        return await processAuthorAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      log(`   ⚠️ Failed to extract author name`)
      if (!dryRun) {
        await markQueueItemError(item._id, 'Failed to extract author name')
      }
      return { success: false }
    }

    if (!authorData.amazonAuthorId) {
      const recoveredPage = await recoverPageIfClosed({
        attempt,
        page,
        pageManager,
        reason: 'author ID extraction',
      })

      if (recoveredPage) {
        return await processAuthorAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

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

    const shouldQueueBookDiscoveries = shouldQueueAuthorBookDiscoveries(item)
    const skipDiscoveries = item.skipBookDiscoveries || !shouldQueueBookDiscoveries

    let booksDiscovered = 0

    if (skipDiscoveries) {
      if (item.skipBookDiscoveries) {
        log(`   ⏭️ Skipping discoveries (skipBookDiscoveries=true)`)
      } else {
        log(`   ⏭️ Skipping downstream discovery for discovered author`)
      }
    } else {
      const discoveries = discoverAuthorLinks(authorData)

      if (discoveries.length > 0) {
        log(`   🔗 Found ${discoveries.length} discoveries:`)
        const bookCount = discoveries.filter((d) => d.type === 'book').length
        log(`      - ${bookCount} books`)

        const queued = await queueDiscoveries(discoveries, item.url)
        log(`   ✅ Queued ${queued} discoveries`)

        booksDiscovered = bookCount
      }
    }

    // Mark queue item complete
    await markQueueItemComplete({
      queueId: item._id,
      authorId,
    })

    incrementScrapingCount()

    log('─'.repeat(60))
    log('')

    return { success: true, authorId, booksDiscovered, booksLinked }
  } catch (error) {
    if (isClosedError(error)) {
      const recoveredPage = await reconnectPageForRetry({
        attempt,
        pageManager,
        reason: 'Page closed while processing author',
      })

      if (recoveredPage) {
        return await processAuthorAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }
    }

    throw error
  }
}

function shouldQueueAuthorBookDiscoveries(item: QueueItem): boolean {
  return item.source === 'user'
}
