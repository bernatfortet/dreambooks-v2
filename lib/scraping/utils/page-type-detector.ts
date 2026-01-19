import type { Page } from 'playwright'

export type AmazonPageType = 'book' | 'series' | 'unknown'

/**
 * Markers that indicate an Amazon series page (vs a book page).
 * Series pages have collection/series-specific elements and lack individual book elements.
 */
const SERIES_MARKERS = {
  // Elements present on series pages
  positiveSelectors: [
    '#collection-title',
    '.series-title',
    'h1[id*="series"]',
    '#seriesTitle',
    '.series-childAsin-item',
    '.series-childAsin-widget',
  ],
  // Text patterns found on series pages
  textPatterns: [
    /\d+\s*books?\s+in\s+this\s+series/i,
    /book\s+series/i,
    /series\s+page/i,
  ],
} as const

/**
 * Markers that indicate an Amazon book product page.
 */
const BOOK_MARKERS = {
  // Elements present on book pages
  positiveSelectors: [
    '#productTitle',
    '#bylineInfo .author',
    '#detailBullets_feature_div',
    '#tmmSwatches', // Format selection (Kindle, Hardcover, etc.)
    '#bookDescription_feature_div',
  ],
} as const

/**
 * Detect if an Amazon page is a book or series page.
 * Use this when book scraping fails to check if it's actually a series.
 *
 * @param page - Playwright page object
 * @returns The detected page type
 */
export async function detectAmazonPageType(page: Page): Promise<AmazonPageType> {
  // Check for series markers first (more specific)
  const isSeriesPage = await checkForSeriesMarkers(page)
  if (isSeriesPage) {
    return 'series'
  }

  // Check for book markers
  const isBookPage = await checkForBookMarkers(page)
  if (isBookPage) {
    return 'book'
  }

  return 'unknown'
}

async function checkForSeriesMarkers(page: Page): Promise<boolean> {
  // Check for series-specific selectors
  for (const selector of SERIES_MARKERS.positiveSelectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element.isVisible({ timeout: 500 }).catch(() => false)
      if (isVisible) {
        console.log(`   🔍 Series marker found: ${selector}`)
        return true
      }
    } catch {
      continue
    }
  }

  // Check for series-specific text patterns
  try {
    const bodyText = await page.locator('body').textContent()
    if (bodyText) {
      for (const pattern of SERIES_MARKERS.textPatterns) {
        if (pattern.test(bodyText)) {
          console.log(`   🔍 Series text pattern matched: ${pattern}`)
          return true
        }
      }
    }
  } catch {
    // Ignore text extraction failures
  }

  return false
}

async function checkForBookMarkers(page: Page): Promise<boolean> {
  let markerCount = 0

  for (const selector of BOOK_MARKERS.positiveSelectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element.isVisible({ timeout: 500 }).catch(() => false)
      if (isVisible) {
        markerCount++
      }
    } catch {
      continue
    }
  }

  // Need at least 2 book markers to confirm it's a book page
  return markerCount >= 2
}
