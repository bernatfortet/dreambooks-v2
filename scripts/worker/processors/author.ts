import type { Page } from 'playwright'
import { parseAuthorFromPage } from '../../../lib/scraping/domains/author/parse'
import { discoverAuthorLinks } from '../../../lib/scraping/domains/author/discover'
import { navigateWithRetry } from '../browser'
import { truncate, incrementScrapingCount } from '../utils'
import {
  getConvexClient,
  markQueueItemComplete,
  markQueueItemError,
  queueDiscoveries,
  type QueueItem,
  type Id,
} from '../convex'
import { api } from '../../../convex/_generated/api'

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
export async function processAuthorFromQueue(params: {
  item: QueueItem
  page: Page
  dryRun: boolean
}): Promise<ProcessAuthorResult> {
  const { item, page, dryRun } = params

  console.log(`👤 Processing author: ${truncate(item.url, 60)}`)

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
    console.log(`   ⚠️ Failed to extract author name`)
    if (!dryRun) {
      await markQueueItemError(item._id, 'Failed to extract author name')
    }
    return { success: false }
  }

  if (!authorData.amazonAuthorId) {
    console.log(`   ⚠️ Failed to extract Amazon author ID`)
    if (!dryRun) {
      await markQueueItemError(item._id, 'Failed to extract Amazon author ID')
    }
    return { success: false }
  }

  console.log(`   ✅ Parsed: ${authorData.name}`)
  console.log(`   Amazon ID: ${authorData.amazonAuthorId}`)
  console.log(`   Bio: ${authorData.bio ? `${authorData.bio.substring(0, 50)}...` : 'None'}`)
  console.log(`   Series found: ${authorData.series.length}`)
  console.log(`   Books found: ${authorData.books.length}`)

  if (dryRun) {
    console.log(`   🏁 Would import (dry run)`)
    return { success: true }
  }

  // Import author to Convex
  const apiKey = process.env.SCRAPE_IMPORT_KEY
  if (!apiKey) {
    throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
  }

  const client = getConvexClient()
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
    })

    authorId = importResult.authorId
    booksLinked = importResult.booksLinked
    console.log(`   ✅ Imported: ${authorId} (new: ${importResult.isNew}, books linked: ${booksLinked})`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.log(`   🚨 Import failed: ${message}`)
    await markQueueItemError(item._id, message)
    return { success: false }
  }

  // Extract discoveries and queue them
  const discoveries = discoverAuthorLinks(authorData)

  if (discoveries.length > 0) {
    console.log(`   🔗 Found ${discoveries.length} discoveries:`)
    const seriesCount = discoveries.filter((d) => d.type === 'series').length
    const bookCount = discoveries.filter((d) => d.type === 'book').length
    console.log(`      - ${seriesCount} series, ${bookCount} books`)

    if (!dryRun) {
      const queued = await queueDiscoveries(discoveries)
      console.log(`   ✅ Queued ${queued} discoveries`)
    }
  }

  const seriesAdded = discoveries.filter((d) => d.type === 'series').length

  // Mark queue item complete
  await markQueueItemComplete({
    queueId: item._id,
    authorId,
  })

  incrementScrapingCount()

  return { success: true, authorId, seriesAdded, booksLinked }
}
