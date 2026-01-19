import type { Page } from 'playwright'

import type { PageManager } from '../browser'
import { humanDelay } from '../utils'
import { fetchSeriesNeedingUrlDiscovery } from '../convex'
import { discoverSeriesUrl } from '../processors/series-url'

type FlowResult = {
  workDone: boolean
}

/**
 * Flow: Discover series URLs
 *
 * For series that were created without a sourceUrl (e.g., from book imports),
 * navigates to an associated book's Amazon page to extract the series link.
 */
export async function processSeriesDiscoveryFlow(params: {
  page: Page
  pageManager?: PageManager
  dryRun: boolean
}): Promise<FlowResult> {
  const { pageManager, dryRun } = params
  let { page } = params

  const seriesNeedingUrl = await fetchSeriesNeedingUrlDiscovery(2)

  if (seriesNeedingUrl.length === 0) {
    console.log('🔗 No series need URL discovery')
    return { workDone: false }
  }

  console.log(`🔗 Found ${seriesNeedingUrl.length} series needing URL discovery`)
  let workDone = false

  for (const series of seriesNeedingUrl) {
    // Get a fresh page for each item (auto-heals if tab was closed)
    if (pageManager) {
      page = await pageManager.getPage()
    }

    await humanDelay(2000, 4000, 'Preparing URL discovery')

    const result = await discoverSeriesUrl({ series, page, dryRun })
    if (result.success) workDone = true

    await humanDelay(5000, 10000, 'Waiting before next item')
  }

  return { workDone }
}
