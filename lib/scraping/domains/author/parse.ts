import type { Page } from 'playwright'
import { AuthorData, AuthorSeriesEntry, AuthorBookEntry } from './types'

/**
 * Parse author data from an Amazon author page using Playwright.
 * Extracts name, bio (from "About" tab), image, series, and books.
 */
export async function parseAuthorFromPage(page: Page): Promise<AuthorData> {
  console.log('🌀 Parsing Amazon author page...')

  const amazonAuthorId = extractAmazonAuthorIdFromUrl(page.url())
  const name = await extractAuthorName(page)
  const imageUrl = await extractProfileImage(page)
  const bio = await extractBio(page)
  const series = await extractSeries(page)
  const books = await extractBooks(page)

  const authorData: AuthorData = {
    name,
    bio,
    imageUrl,
    amazonAuthorId,
    series,
    books,
  }

  console.log('✅ Parsed author data:', {
    name: authorData.name,
    amazonAuthorId: authorData.amazonAuthorId,
    hasBio: !!authorData.bio,
    seriesCount: authorData.series.length,
    booksCount: authorData.books.length,
  })

  return authorData
}

// --- Extraction helpers ---

function extractAmazonAuthorIdFromUrl(url: string): string | null {
  // Patterns: /author/B000APEZHY or /e/B000APEZHY
  const match = url.match(/\/(?:author|e)\/([A-Z0-9]+)/)
  return match?.[1] ?? null
}

async function extractAuthorName(page: Page): Promise<string | null> {
  const selectors = ['h1.a-size-extra-large', 'h1[class*="author"]', '.a-profile-descriptor', 'h1']

  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element.isVisible({ timeout: 1000 }).catch(() => false)

      if (isVisible) {
        const text = await element.textContent()
        if (text) {
          const cleaned = text.trim()
          // Skip if it looks like a button or navigation element
          if (cleaned.length > 2 && cleaned.length < 100) {
            console.log(`   Found author name: "${cleaned}"`)
            return cleaned
          }
        }
      }
    } catch {
      continue
    }
  }

  return null
}

async function extractBio(page: Page): Promise<string | null> {
  console.log('   🔍 Looking for bio (About tab)...')

  // Try to click the "About" tab first
  const aboutSelectors = [
    'a[href*="About"]',
    'button:has-text("About")',
    '[role="tab"]:has-text("About")',
    'a:has-text("About the author")',
    'a:has-text("About")',
    '[data-action="a-expander-toggle"]',
  ]

  for (const selector of aboutSelectors) {
    try {
      const tab = page.locator(selector).first()
      const isVisible = await tab.isVisible({ timeout: 1000 }).catch(() => false)

      if (isVisible) {
        console.log(`   Clicking "${selector}" to reveal bio...`)
        await tab.click()
        await page.waitForTimeout(1500)
        break
      }
    } catch {
      continue
    }
  }

  // Now try to extract the bio text
  const bioSelectors = [
    '.author-bio',
    '[data-testid="author-bio"]',
    '.abt-d-content',
    '#authorBio',
    '.a-expander-content',
    '.apb-browse-searchresults-about-author-text',
  ]

  for (const selector of bioSelectors) {
    try {
      const bio = page.locator(selector).first()
      const isVisible = await bio.isVisible({ timeout: 500 }).catch(() => false)

      if (isVisible) {
        const text = await bio.textContent()
        if (text && text.trim().length > 20) {
          const cleaned = text.trim().replace(/\s+/g, ' ')
          console.log(`   Found bio (${cleaned.length} chars)`)
          return cleaned
        }
      }
    } catch {
      continue
    }
  }

  console.log('   No bio found')
  return null
}

async function extractProfileImage(page: Page): Promise<string | null> {
  console.log('   🔍 Looking for profile image...')

  // Scroll to top to ensure header is visible
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1000)

  // More specific selectors for actual author profile pictures
  // Note: Many authors don't have profile pictures - Amazon shows placeholders or banners
  // Priority: Most specific profile image selectors first
  const selectors = [
    // Amazon author page - profile image (Playwright sees different structure)
    'img[alt$="profile image"]', // alt ends with "profile image"
    'img[class*="authorImage"]', // class contains "authorImage"
    'img[class*="_author-header-card"]', // author header card style
    // Desktop header structure (when available)
    '[data-testid="header-logo-section"] img[data-testid="image"]',
    '[data-testid="header-logo-section"] img',
    'img[alt*="Visit"][alt*="Store on Amazon"]',
    '[data-testid="header-nav-area"] img[data-testid="image"]',
    '[class*="Header__author-logo"] img',
    '[class*="Header__leftColumn"] img',
    // Older Amazon author page formats
    '.a-profile-avatar img',
    '.author-image img',
    'img[data-testid="author-image"]',
    '.apb-browse-searchresults-about-author-image img',
    '[class*="AuthorImage"] img',
    // Generic circle image (fallback - may match wrong image)
    'img[class*="Image__circle"]',
  ]

  for (const selector of selectors) {
    try {
      const img = page.locator(selector).first()
      // Longer timeout for header elements which may load slower
      const timeout = selector.includes('header') || selector.includes('Header') ? 2000 : 500
      const isVisible = await img.isVisible({ timeout }).catch(() => false)

      if (isVisible) {
        const src = await img.getAttribute('src')

        // Skip if not a valid author image
        if (!src || !isValidAuthorImageUrl(src)) {
          continue
        }

        // Try data-a-dynamic-image first (contains multiple sizes)
        const dynamicImage = await img.getAttribute('data-a-dynamic-image')
        if (dynamicImage) {
          try {
            const imageMap = JSON.parse(dynamicImage) as Record<string, unknown>
            const urls = Object.keys(imageMap)
            const validUrls = urls.filter((url) => isValidAuthorImageUrl(url))
            const largest = validUrls.sort((a, b) => extractImageSize(b) - extractImageSize(a))[0]
            if (largest) {
              console.log(`   Found profile image (dynamic): ${largest.substring(0, 60)}...`)
              return upgradeImageUrl(largest)
            }
          } catch {
            // Ignore JSON parse errors
          }
        }

        // Use src directly
        console.log(`   Found profile image: ${src.substring(0, 60)}...`)
        return upgradeImageUrl(src)
      }
    } catch {
      continue
    }
  }

  console.log('   No profile image found')
  return null
}

function isValidAuthorImageUrl(url: string): boolean {
  if (!url) return false

  // Filter out data URIs
  if (url.startsWith('data:')) return false

  // Filter out known Amazon banner/placeholder images
  const invalidPatterns = [
    'Author_Store_Banner',
    'author-cx',
    'grey-pixel',
    'transparent-pixel',
    'amazon-avatars-global/default',
    '/G/01/', // Amazon UI assets path
  ]

  for (const pattern of invalidPatterns) {
    if (url.includes(pattern)) {
      console.log(`   Skipping invalid image URL (matches ${pattern}): ${url.substring(0, 60)}...`)
      return false
    }
  }

  // Must be an actual image URL (usually from media-amazon.com/images/I/)
  if (!url.includes('media-amazon.com/images/I/')) {
    console.log(`   Skipping non-product image URL: ${url.substring(0, 60)}...`)
    return false
  }

  return true
}

async function extractSeries(page: Page): Promise<AuthorSeriesEntry[]> {
  console.log('   🔍 Looking for series...')
  const series: AuthorSeriesEntry[] = []
  const seenUrls = new Set<string>()

  // Scroll to load lazy content
  await autoScroll(page)

  // Find series links - they typically contain /series/ in the URL
  const seriesSelectors = ['a[href*="/series/"]', 'a[href*="dp/"][title*="Series"]']

  for (const selector of seriesSelectors) {
    try {
      const links = await page.locator(selector).all()

      for (const link of links) {
        try {
          const href = await link.getAttribute('href')
          if (!href || seenUrls.has(href)) continue

          const fullUrl = href.startsWith('http') ? href : `https://www.amazon.com${href}`
          seenUrls.add(href)

          const name = await link.textContent()

          // Try to find book count from nearby text
          let bookCount: number | null = null
          const parentText = await link
            .locator('..')
            .textContent()
            .catch(() => null)
          if (parentText) {
            const countMatch = parentText.match(/(\d+)\s*books?/i)
            if (countMatch) bookCount = parseInt(countMatch[1], 10)
          }

          series.push({
            name: name?.trim() ?? null,
            amazonUrl: fullUrl,
            bookCount,
          })
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  console.log(`   Found ${series.length} series`)
  return series
}

async function extractBooks(page: Page): Promise<AuthorBookEntry[]> {
  console.log('   🔍 Looking for books...')
  const books: AuthorBookEntry[] = []
  const seenAsins = new Set<string>()

  // Find book items
  const bookSelectors = ['[data-asin]:has(a[href*="/dp/"])', '.a-carousel-card:has(a[href*="/dp/"])', 'a[href*="/dp/"][data-asin]']

  for (const selector of bookSelectors) {
    try {
      const elements = await page.locator(selector).all()

      for (const element of elements.slice(0, 30)) {
        try {
          // Get ASIN
          let asin = await element.getAttribute('data-asin')
          if (!asin) {
            const href = await element.getAttribute('href')
            if (href) {
              const match = href.match(/\/dp\/([A-Z0-9]{10})/)
              asin = match?.[1] ?? null
            }
          }

          if (!asin || seenAsins.has(asin)) continue
          seenAsins.add(asin)

          // Get title from title attribute or link text
          const titleLink = element.locator('a[href*="/dp/"]').first()
          let title = await titleLink.getAttribute('title').catch(() => null)
          if (!title) {
            title = await titleLink.textContent().catch(() => null)
          }

          // Get cover image
          const img = element.locator('img').first()
          let coverImageUrl: string | null = null
          const imgSrc = await img.getAttribute('src').catch(() => null)
          if (imgSrc && !imgSrc.includes('data:')) {
            coverImageUrl = upgradeImageUrl(imgSrc)
          }

          // Build URL
          const amazonUrl = `https://www.amazon.com/dp/${asin}`

          books.push({
            title: title?.trim() ?? null,
            asin,
            amazonUrl,
            coverImageUrl,
          })
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  // Fallback: find all /dp/ links if no structured elements found
  if (books.length === 0) {
    try {
      const links = await page.locator('a[href*="/dp/"]').all()

      for (const link of links.slice(0, 30)) {
        try {
          const href = await link.getAttribute('href')
          if (!href) continue

          const match = href.match(/\/dp\/([A-Z0-9]{10})/)
          const asin = match?.[1]
          if (!asin || seenAsins.has(asin)) continue
          seenAsins.add(asin)

          const title = (await link.getAttribute('title')) ?? (await link.textContent())

          books.push({
            title: title?.trim() ?? null,
            asin,
            amazonUrl: `https://www.amazon.com/dp/${asin}`,
            coverImageUrl: null,
          })
        } catch {
          continue
        }
      }
    } catch {
      // Ignore
    }
  }

  console.log(`   Found ${books.length} books`)
  return books
}

// --- Utility helpers ---

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0
      const distance = 400
      const maxScrolls = 8
      let scrollCount = 0

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance
        scrollCount++

        if (totalHeight >= scrollHeight || scrollCount >= maxScrolls) {
          clearInterval(timer)
          window.scrollTo(0, 0)
          resolve()
        }
      }, 150)
    })
  })
}

function extractImageSize(url: string): number {
  const match = url.match(/_S[XLY](\d+)_/)
  return match ? parseInt(match[1], 10) : 0
}

function upgradeImageUrl(url: string): string {
  // Replace small image size markers with larger ones
  // Common patterns: ._SY200_, ._SX200_, ._SL200_ → ._SL1500_
  return url.replace(/\._S[XYL]\d+_/, '._SL1500_')
}
