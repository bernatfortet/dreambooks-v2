import { log } from '../utils'
import {
  fetchOutdatedSeries,
  fetchOutdatedBooks,
  fetchOutdatedAuthors,
  queueEntityForRescrape,
  type OutdatedEntity,
} from '../convex'
import { SCRAPE_VERSIONS } from '@/lib/scraping/config'
import { normalizeAmazonUrl } from '@/lib/scraping/utils/amazon-url'
import { fetchRecentQueueItems, type QueueHistoryItem } from '../queue-history'

type FlowResult = {
  workDone: boolean
}

const RECENT_QUEUE_HISTORY_LIMIT = 200
const AUTO_RESCRAPE_COOLDOWN_MS = 30 * 60 * 1000

/**
 * Flow: Queue outdated entities for re-scraping
 *
 * Checks each entity type for items with scrapeVersion < current version
 * and queues them for re-scraping. This allows automatic re-scraping
 * when the scrape version is bumped in the codebase.
 */
export async function processVersionUpgradeFlow(params: { dryRun: boolean }): Promise<FlowResult> {
  const { dryRun } = params

  let workDone = false

  // Check each entity type for outdated versions
  const outdatedSeries = await fetchOutdatedSeries(SCRAPE_VERSIONS.series, 3)
  const outdatedBooks = await fetchOutdatedBooks(SCRAPE_VERSIONS.book, 3)
  const outdatedAuthors = await fetchOutdatedAuthors(SCRAPE_VERSIONS.author, 3)
  const recentQueueItems = dryRun ? [] : await fetchRecentQueueItems(RECENT_QUEUE_HISTORY_LIMIT)

  const allOutdated: OutdatedEntity[] = [...outdatedSeries, ...outdatedBooks, ...outdatedAuthors]

  if (allOutdated.length === 0) {
    log('🔄 No entities need version upgrade')
    return { workDone: false }
  }

  log(`🔄 Found ${allOutdated.length} entities needing version upgrade`)

  for (const entity of allOutdated) {
    const versionInfo = entity.scrapeVersion === null ? 'no version' : `v${entity.scrapeVersion}`
    const targetVersion = SCRAPE_VERSIONS[entity.type]

    log(`   📦 ${entity.type}: "${entity.name}" (${versionInfo} → v${targetVersion})`)

    if (dryRun) {
      log(`      ⏭️ Would queue for re-scrape (dry run)`)
      continue
    }

    const recentAttempt = findRecentAutoRescrapeAttempt(recentQueueItems, entity.sourceUrl)
    if (recentAttempt) {
      log(`      ⏭️ Skipping auto requeue: ${buildSkipReason(recentAttempt)}`)
      continue
    }

    try {
      const queueId = await queueEntityForRescrape(entity.type, entity._id)
      log(`      ✅ Queued for re-scrape: ${queueId}`)
      workDone = true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log(`      ❌ Failed to queue: ${message}`)
    }
  }

  return { workDone }
}

function findRecentAutoRescrapeAttempt(
  queueItems: QueueHistoryItem[],
  sourceUrl: string | undefined,
): QueueHistoryItem | null {
  if (!sourceUrl) return null

  const normalizedSourceUrl = normalizeAmazonUrl(sourceUrl)
  const now = Date.now()

  const matchingAttempts = queueItems
    .filter((item) => item.referrerReason === 'rescrape')
    .filter((item) => normalizeAmazonUrl(item.url) === normalizedSourceUrl)
    .sort((left, right) => getAttemptTimestamp(right) - getAttemptTimestamp(left))

  const latestAttempt = matchingAttempts[0]
  if (!latestAttempt) return null

  const latestTimestamp = getAttemptTimestamp(latestAttempt)
  if (now - latestTimestamp >= AUTO_RESCRAPE_COOLDOWN_MS) return null

  return latestAttempt
}

function getAttemptTimestamp(queueItem: QueueHistoryItem): number {
  const timestamp = queueItem.completedAt ?? queueItem.startedAt ?? queueItem.createdAt
  return timestamp
}

function buildSkipReason(queueItem: QueueHistoryItem): string {
  if (queueItem.status === 'pending') {
    return 'a rescrape for this URL is already pending'
  }

  if (queueItem.status === 'processing') {
    return 'a rescrape for this URL is already processing'
  }

  if (queueItem.status === 'error') {
    return `last rescrape failed recently (${summarizeQueueError(queueItem.errorMessage)})`
  }

  return 'this URL was rescraped recently'
}

function summarizeQueueError(errorMessage: string | undefined): string {
  if (!errorMessage) return 'unknown error'

  const firstLine = errorMessage.split('\n')[0]?.trim()
  if (!firstLine) return 'unknown error'

  const maxLength = 120
  if (firstLine.length <= maxLength) return firstLine

  return `${firstLine.slice(0, maxLength - 3)}...`
}
