import type { Page } from 'playwright'

import type { PageManager } from '../browser'
import { humanDelay } from '../utils'
import { fetchBooksNeedingEnrichment } from '../convex'
import { enrichBook } from '../processors/enrichment'

type FlowResult = {
  workDone: boolean
}

/**
 * Flow: Enrich books with full details
 *
 * Processes books that only have basic info (detailsStatus: 'basic')
 * and scrapes their full page for additional details.
 */
export async function processEnrichmentFlow(params: {
  page: Page
  pageManager?: PageManager
  dryRun: boolean
}): Promise<FlowResult> {
  const { pageManager, dryRun } = params
  let { page } = params

  const books = await fetchBooksNeedingEnrichment(3)

  if (books.length === 0) {
    console.log('📖 No books need enrichment')
    return { workDone: false }
  }

  console.log(`📖 Found ${books.length} books needing enrichment`)
  let workDone = false

  for (const book of books) {
    // Get a fresh page for each item (auto-heals if tab was closed)
    if (pageManager) {
      page = await pageManager.getPage()
    }

    await humanDelay(2000, 4000, 'Preparing next book')

    const success = await enrichBook({ book, page, dryRun })
    if (success) workDone = true

    await humanDelay(5000, 10000, 'Waiting before next item')
  }

  return { workDone }
}
