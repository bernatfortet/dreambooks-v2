import type { Page } from 'playwright'
import { parseBookFromPage, ensurePreferredFormat } from '@/lib/scraping/domains/book/parse'
import { type PageManager, isClosedError, navigateWithRetry, reconnectPageForRetry, recoverPageIfClosed } from '../browser'
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
export async function discoverSeriesUrl(params: {
  series: SeriesNeedingUrl
  page: Page
  pageManager?: PageManager
  dryRun: boolean
}): Promise<DiscoverResult> {
  const { series, page, dryRun } = params

  log(`🔍 Discovering URL for series: ${series.name}`)
  log(`   📖 Using book: ${series.bookAmazonUrl.substring(0, 60)}...`)

  return await discoverSeriesUrlAttempt({
    ...params,
    page,
    dryRun,
    attempt: 1,
  })
}

async function discoverSeriesUrlAttempt(params: {
  series: SeriesNeedingUrl
  page: Page
  pageManager?: PageManager
  dryRun: boolean
  attempt: number
}): Promise<DiscoverResult> {
  const { series, page, pageManager, dryRun, attempt } = params

  try {
    // Navigate to book page
    const navResult = await navigateWithRetry({ page, url: series.bookAmazonUrl })
    if (!navResult.success) {
      const recoveredPage =
        navResult.needsReconnect
          ? await reconnectPageForRetry({
              attempt,
              pageManager,
              reason: 'Page closed during series URL discovery navigation',
            })
          : null

      if (recoveredPage) {
        return await discoverSeriesUrlAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      log(`   ⚠️ Failed to navigate to book page`)
      return { success: false }
    }

    // Upgrade to preferred format if available (for consistency)
    await ensurePreferredFormat(page)

    // Parse book data to get series URL
    const bookData = await parseBookFromPage(page)

    if (!bookData.seriesUrl) {
      const recoveredPage = await recoverPageIfClosed({
        attempt,
        page,
        pageManager,
        reason: 'series URL discovery parsing',
      })

      if (recoveredPage) {
        return await discoverSeriesUrlAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

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
  } catch (error) {
    if (isClosedError(error)) {
      const recoveredPage = await reconnectPageForRetry({
        attempt,
        pageManager,
        reason: 'Page closed while discovering series URL',
      })

      if (recoveredPage) {
        return await discoverSeriesUrlAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }
    }

    throw error
  }
}
