import { ScrapeResult, ScrapeOptions } from '@/lib/scraping/types'
import { withBrowser, navigateWithRetry } from '@/lib/scraping/providers/playwright/browser'
import { SeriesData } from './types'
import { parseSeriesFromPage } from './parse'

/**
 * Scrape series data from an Amazon series URL.
 * Uses Playwright with stealth plugin for better bot bypassing.
 */
export async function scrapeSeries(url: string, options?: ScrapeOptions): Promise<ScrapeResult<SeriesData>> {
  const headless = options?.headless ?? true

  console.log('🏁 Starting series scrape with Playwright', { url, headless })

  const result = await withBrowser({
    config: { headless },
    action: async (page) => {
      await navigateWithRetry({ page, url, waitMs: 3000 })

      // Check for bot detection page (use evaluate for speed)
      const pageText = await page.evaluate(() => document.body?.textContent ?? '')
      if (pageText?.includes('Continue shopping') || pageText?.includes('robot')) {
        console.log('⚠️ Bot detection page detected, attempting to bypass...')

        // Try clicking continue button
        const continueButton = page.locator('button:has-text("Continue"), input[type="submit"]').first()
        const buttonVisible = await continueButton.isVisible({ timeout: 500 }).catch(() => false)

        if (buttonVisible) {
          await continueButton.click()
          await page.waitForTimeout(1500)
          await navigateWithRetry({ page, url, waitMs: 2000 })
        }
      }

      const seriesData = await parseSeriesFromPage(page)

      return seriesData
    },
  })

  return result
}
