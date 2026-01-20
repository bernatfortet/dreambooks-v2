import type { Page } from 'playwright'
import { parseBookFromPage, ensurePreferredFormat } from '@/lib/scraping/domains/book/parse'
import { navigateWithRetry } from '../browser'
import { incrementScrapingCount, log } from '../utils'
import { updateSeriesSourceUrl, type SeriesNeedingUrl, type Id } from '../convex'

type DiscoverResult = {
  success: boolean
  seriesUrl?: string
}

/**
 * Discover the series URL by navigating to a book's Amazon page
 * and extracting the series link.
 */
export async function discoverSeriesUrl(params: { series: SeriesNeedingUrl; page: Page; dryRun: boolean }): Promise<DiscoverResult> {
  const { series, page, dryRun } = params

  log(`🔍 Discovering URL for series: ${series.name}`)
  log(`   📖 Using book: ${series.bookAmazonUrl.substring(0, 60)}...`)

  // Navigate to book page
  const navResult = await navigateWithRetry({ page, url: series.bookAmazonUrl })
  if (!navResult.success) {
    log(`   ⚠️ Failed to navigate to book page`)
    return { success: false }
  }

  // Upgrade to preferred format if available (for consistency)
  await ensurePreferredFormat(page)

  // Parse book data to get series URL
  const bookData = await parseBookFromPage(page)

  if (!bookData.seriesUrl) {
    log(`   ⚠️ No series URL found on book page`)
    return { success: false }
  }

  log(`   ✅ Found series URL: ${bookData.seriesUrl.substring(0, 60)}...`)

  if (dryRun) {
    log(`   🏁 Would update series (dry run)`)
    return { success: true, seriesUrl: bookData.seriesUrl }
  }

  // Update series with discovered URL
  await updateSeriesSourceUrl(series._id as Id<'series'>, bookData.seriesUrl)
  log(`   ✅ Updated series with URL`)

  incrementScrapingCount()

  return { success: true, seriesUrl: bookData.seriesUrl }
}
