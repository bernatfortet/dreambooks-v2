'use node'

import { internalAction } from '../../../_generated/server'
import { v } from 'convex/values'

export type ScrapedSeriesData = {
  seriesName: string
  description?: string
  coverImageUrl?: string
  expectedBookCount?: number
  books: Array<{
    title: string
    amazonUrl: string
    asin?: string
    position?: number
  }>
  pagination?: {
    currentPage: number
    totalPages: number
    nextPageUrl?: string
  }
}

/**
 * Series scraping via Convex action is not supported.
 * Playwright cannot run in Convex's serverless environment.
 *
 * Use CLI instead:
 *   bun scripts/scrape-series.ts <seriesId>
 */
export const crawlSeriesWithAmazon = internalAction({
  args: { url: v.string() },
  handler: async (_context, _args): Promise<ScrapedSeriesData> => {
    throw new Error(
      'Series scraping requires Playwright which cannot run in Convex. ' +
        'Use CLI instead: bun scripts/scrape-series.ts <seriesId>'
    )
  },
})
