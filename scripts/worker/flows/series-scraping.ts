import type { Page } from 'playwright'

import type { PageManager } from '../browser'
import { humanDelay } from '../utils'
import { fetchSeriesNeedingScrape } from '../convex'
import { processSeriesFromQueue } from '../processors/series'

type FlowResult = {
  workDone: boolean
}

/**
 * Flow: Scrape pending/partial series
 *
 * Processes series that need scraping:
 * - 'pending': Series with sourceUrl that haven't been scraped yet
 * - 'partial': Series with pagination (nextPageUrl) that need more pages
 */
export async function processSeriesScrapingFlow(params: {
  page: Page
  pageManager?: PageManager
  dryRun: boolean
}): Promise<FlowResult> {
  const { pageManager, dryRun } = params
  let { page } = params

  const seriesList = await fetchSeriesNeedingScrape(2)

  if (seriesList.length === 0) {
    console.log('📚 No series need scraping')
    return { workDone: false }
  }

  console.log(`📚 Found ${seriesList.length} series needing scraping`)
  let workDone = false

  for (const series of seriesList) {
    // Get a fresh page for each item (auto-heals if tab was closed)
    if (pageManager) {
      page = await pageManager.getPage()
    }

    await humanDelay(3000, 6000, 'Preparing next series')

    // Use nextPageUrl for partial series, sourceUrl for pending
    const url = series.scrapeStatus === 'partial' ? series.nextPageUrl : series.sourceUrl
    if (!url) {
      console.log(`   ⚠️ No URL for series: ${series.name}`)
      continue
    }

    if (series.scrapeStatus === 'partial') {
      console.log(`   📄 Continuing pagination for: ${series.name}`)
    }

    // Create a synthetic queue item for the processor
    // Note: queueId is omitted since this isn't from the queue - errors should update series, not queue
    const item = {
      _id: series._id,
      url,
      type: 'series' as const,
      scrapeFullSeries: true,
      priority: 10,
      createdAt: Date.now(),
    }

    const result = await processSeriesFromQueue({ item, page, dryRun, seriesId: series._id })
    if (result.success) workDone = true

    await humanDelay(8000, 15000, 'Waiting before next item')
  }

  return { workDone }
}
