import { log } from '../utils'
import { fetchOutdatedSeries, fetchOutdatedBooks, fetchOutdatedAuthors, queueEntityForRescrape, type OutdatedEntity } from '../convex'
import { SCRAPE_VERSIONS } from '@/lib/scraping/config'

type FlowResult = {
  workDone: boolean
}

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
