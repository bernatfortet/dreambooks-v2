import type { Page } from 'playwright'

import type { PageManager } from '../browser'
import { humanDelay, getWorkerId, startItemLog, finishItemLog, log, logError } from '../utils'
import { fetchPendingQueueItems, claimQueueItem, markQueueItemError } from '../convex'
import { processBookFromQueue } from '../processors/book'
import { processSeriesFromQueue } from '../processors/series'
import { processAuthorFromQueue } from '../processors/author'

type FlowResult = {
  workDone: boolean
}

/**
 * Flow: Process queue items (URLs added from the admin UI)
 *
 * Handles new books, series, and authors added via /ad/ interface.
 */
export async function processQueueFlow(params: { page: Page; pageManager?: PageManager; dryRun: boolean }): Promise<FlowResult> {
  const { pageManager, dryRun } = params
  let { page } = params

  const queueItems = await fetchPendingQueueItems(3)

  if (queueItems.length === 0) {
    console.log('📋 No queued items')
    return { workDone: false }
  }

  console.log(`📋 Found ${queueItems.length} queued items`)
  let workDone = false
  const workerId = getWorkerId()

  for (const item of queueItems) {
    // Get a fresh page for each item (auto-heals if tab was closed)
    if (pageManager) {
      page = await pageManager.getPage()
    }

    // Try to claim the item (skip if another worker already claimed it)
    if (!dryRun) {
      const claimResult = await claimQueueItem(item._id, workerId)
      if (!claimResult.success) {
        console.log(`   ⏭️ Item already claimed by another worker`)
        continue
      }
    }

    // Count a claimed item as progress so the worker immediately re-polls
    // after clearing errors instead of sleeping as if it were idle.
    workDone = true

    await humanDelay(2000, 4000, 'Preparing next item')

    startItemLog()

    const itemType = item.type
    let success = false

    try {
      if (itemType === 'book') {
        const result = await processBookFromQueue({ item, page, dryRun })
        success = result.success
        if (result.success) workDone = true
      } else if (itemType === 'series') {
        const result = await processSeriesFromQueue({ item, page, dryRun })
        success = result.success
        if (result.success) {
          workDone = true
          log(`   📊 Processed ${result.booksProcessed ?? 0} book(s)`)
        }
      } else if (itemType === 'author') {
        const result = await processAuthorFromQueue({ item, page, dryRun })
        success = result.success
        if (result.success) {
          workDone = true
          log(
            `   📊 Linked ${result.booksLinked ?? 0} book(s), discovered ${result.booksDiscovered ?? 0} books and ${result.seriesAdded ?? 0} series`,
          )
        }
      }
    } catch (error) {
      logError('   🚨 Queue item crashed', error)

      if (!dryRun) {
        const message = error instanceof Error ? error.message : 'Unknown queue processing error'
        await markQueueItemError(item._id, message)
      }
    } finally {
      finishItemLog(itemType, item.url, success, item.referrerUrl, item.referrerReason)
    }

    await humanDelay(5000, 10000, 'Waiting before next item')
  }

  return { workDone }
}
