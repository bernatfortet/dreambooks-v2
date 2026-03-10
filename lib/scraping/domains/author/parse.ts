import type { Page } from 'playwright'
import { AuthorData, AuthorSeriesEntry, AuthorBookEntry } from './types'
import { isAudioFormat } from '../book/types'

type AuthorBookCandidate = AuthorBookEntry & {
  format: string | null
}

/**
 * Parse author data from an Amazon author page using Playwright.
 * Extracts name, bio (from "About" tab), image, series, and books.
 */
export async function parseAuthorFromPage(page: Page): Promise<AuthorData> {
  console.log('🌀 Parsing Amazon author page...')

  const amazonAuthorId = extractAmazonAuthorIdFromUrl(page.url())
  const name = await extractAuthorName(page)
  const imageUrl = await extractProfileImage(page)
  const series = await extractSeries(page)
  const books = await extractBooks(page)
  const bio = await extractBio(page)

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

  const isProductImage = url.includes('media-amazon.com/images/I/')
  const isAuthorMediaImage = url.includes('media-amazon.com/images/S/amzn-author-media-prod/')

  // Accept real author portraits from Amazon's author-media CDN in addition to
  // standard product-image URLs.
  if (!isProductImage && !isAuthorMediaImage) {
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

  const rawBooks = await extractBookCandidates(page)
  const bestBookByAsin = new Map<string, AuthorBookCandidate & { score: number }>()

  for (const book of rawBooks) {
    if (!book.asin || !book.amazonUrl) continue
    if (!isLikelyBookTitle(book.title)) continue
    if (isAudioFormat(book.format)) continue

    const scoredBook = {
      ...book,
      score: getBookCandidateScore(book),
    }

    const existing = bestBookByAsin.get(book.asin)
    if (!existing || scoredBook.score > existing.score) {
      bestBookByAsin.set(book.asin, scoredBook)
    }
  }

  const books: AuthorBookEntry[] = Array.from(bestBookByAsin.values()).map((book) => ({
    title: book.title,
    asin: book.asin,
    amazonUrl: book.amazonUrl,
    coverImageUrl: book.coverImageUrl ? upgradeImageUrl(book.coverImageUrl) : null,
  }))

  console.log(`   Found ${books.length} books`)
  return books
}

async function extractBookCandidates(page: Page): Promise<AuthorBookCandidate[]> {
  try {
    return await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/dp/"], a[href*="/gp/product/"]'))
        .map((anchor) => {
          const href = anchor.getAttribute('href')
          const asin = href?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() ?? null
          const title = (anchor.getAttribute('title') || anchor.getAttribute('aria-label') || anchor.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()

          const cardRoot =
            anchor.closest('[data-testid], .a-carousel-card, .a-section, li, article, div') ??
            anchor.parentElement ??
            anchor
          const image =
            anchor.querySelector<HTMLImageElement>('img[src]') ??
            cardRoot.querySelector<HTMLImageElement>('img[src]')
          const imageUrl = image?.getAttribute('src')
          const contextText = (cardRoot.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
          const combinedText = [title, anchor.getAttribute('aria-label') || '', contextText].join(' ').toLowerCase()

          return {
            title: title || null,
            asin,
            amazonUrl: asin ? `https://www.amazon.com/dp/${asin}` : null,
            coverImageUrl: imageUrl && !imageUrl.startsWith('data:') ? imageUrl : null,
            format: detectCandidateFormat(combinedText),
          }
        })
        .filter((book) => book.asin && book.title)
    })
  } catch {
    return []
  }
}

function isLikelyBookTitle(title: string | null): title is string {
  if (!title) return false

  const cleaned = title.trim()
  if (!cleaned) return false
  if (/^(hardcover|paperback|audiobook|audio cd|school & library binding|preloaded digital audio player|see all)$/i.test(cleaned)) {
    return false
  }
  if (/^book\s+\d+\s+of\s+\d+:/i.test(cleaned)) return false
  if (/^part of:/i.test(cleaned)) return false
  if (/^quick look/i.test(cleaned)) return false

  return true
}

function getBookCandidateScore(book: AuthorBookEntry): number {
  let score = 0

  if (book.title && !/^book \d+ of \d+/i.test(book.title)) score += 4
  if (book.title && !/^part of:/i.test(book.title)) score += 2
  if (book.title && book.title.length > 6) score += 1
  if (book.coverImageUrl) score += 1

  return score
}

function detectCandidateFormat(text: string): string | null {
  if (text.includes('audiobook') || text.includes('audible') || text.includes('audio cd')) {
    return 'audiobook'
  }
  if (text.includes('hardcover')) return 'hardcover'
  if (text.includes('paperback')) return 'paperback'
  if (text.includes('kindle')) return 'kindle'

  return null
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
  if (!url || !url.includes('media-amazon.com/images')) {
    return url
  }

  // Remove all size/crop parameters and replace with SL800 to limit to 800px max edge
  // Matches: ._SY522_., ._AC_SX200_SY200_., ._SL1500_., etc.
  const AMAZON_IMAGE_SIZE_PATTERN = /\.(_[A-Z][A-Z0-9_]*_)\./
  return url.replace(AMAZON_IMAGE_SIZE_PATTERN, '._SL800_.')
}
