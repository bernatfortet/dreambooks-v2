import type { Page } from 'playwright'
import { SeriesData, SeriesBookEntry, SeriesPagination, BookFormat, AuthorLink } from './types'
import { FORMAT_PRIORITY } from '@/lib/scraping/domains/book/types'
import { dumpPageHtml } from '@/lib/scraping/utils/html-dump'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'
import { extractAsin, extractAuthorId, normalizeAmazonUrl } from '@/lib/scraping/utils/amazon-url'
import type { Locator } from 'playwright'

const { visibilityTimeoutMs, textContentTimeoutMs, attributeTimeoutMs } = SCRAPING_CONFIG.extraction

// Consolidated patterns for ASIN extraction from HTML/URLs
const ASIN_URL_PATTERNS = [/\/dp\/([A-Z0-9]{10})/i, /\/gp\/product\/([A-Z0-9]{10})/i, /[?&]asin=([A-Z0-9]{10})/i]

// Pattern for extracting position from URL ref parameter (0-indexed)
const URL_REF_POSITION_PATTERN = /ref_=dbs_m_mng_rwt_calw_thcv_(\d+)/i

// Patterns for extracting position from text
const TEXT_POSITION_PATTERNS = [
  /(?:Book|#)\s*(\d+)(?:\s|$|\)|,|of)/i,
  /(\d+)\s*(?:of|in)\s*(?:this\s*)?series/i,
  /position\s*(\d+)/i,
  /#(\d+)/i,
]

/**
 * Parse series data from an Amazon series page using Playwright.
 * Extracts series name, description, total books, and book list.
 */
export async function parseSeriesFromPage(page: Page): Promise<SeriesData> {
  console.log('🌀 Parsing Amazon series page...')

  // Dump HTML for debugging
  await dumpPageHtml(page, `series_${extractAsin(page.url()) ?? 'unknown'}`)

  await assertLikelySeriesPage(page)

  const name = await extractSeriesName(page)
  const description = await extractDescription(page)
  const totalBooks = await extractTotalBooks(page)
  const coverImageUrl = await extractCoverImage(page)
  const asin = extractAsin(page.url())
  const books = await extractBooks(page)
  const pagination = await extractPagination(page)

  const seriesData: SeriesData = {
    name,
    description,
    totalBooks,
    coverImageUrl,
    asin,
    books,
    pagination,
  }

  console.log('✅ Parsed series data:', {
    name: seriesData.name,
    totalBooks: seriesData.totalBooks,
    booksFound: seriesData.books.length,
    pagination: seriesData.pagination,
  })

  return seriesData
}

// --- Extraction helpers ---

// Blocklist of known bad series name values (UI elements, not actual series names)
const SERIES_NAME_BLOCKLIST = [
  'follow the author',
  'kindle edition',
  'paperback',
  'hardcover',
  'audiobook',
  'audible',
  'see all formats',
  'buy now',
  'add to cart',
  'shop now',
  'continue shopping',
]

function isValidSeriesName(name: string): boolean {
  const normalized = name.toLowerCase().trim()

  // Reject if in blocklist
  if (SERIES_NAME_BLOCKLIST.some((blocked) => normalized.includes(blocked))) {
    console.log(`  ❌ Rejected "${name.substring(0, 30)}..." - matches blocklist`)
    return false
  }

  // Reject if too short
  if (normalized.length < 3) {
    console.log(`  ❌ Rejected "${name}" - too short`)
    return false
  }

  // Reject if just a number
  if (/^\d+$/.test(normalized)) {
    console.log(`  ❌ Rejected "${name}" - just a number`)
    return false
  }

  return true
}

async function extractSeriesName(page: Page): Promise<string | null> {
  // Amazon series pages have specific structures - try most specific first
  const selectors = [
    // Series-specific selectors (most reliable)
    '#collection-title',
    '.series-title',
    'h1[id*="series"]',
    '#seriesTitle',
    // Amazon product page title patterns
    '#productTitle',
    'span#productTitle',
    // Series header on collection pages
    '.a-size-extra-large',
    'h1.a-size-large',
    // Generic fallback (last resort)
    'h1',
  ]

  console.log('🔍 Extracting series name...')

  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)

      if (isVisible) {
        const text = await element.textContent({ timeout: textContentTimeoutMs }).catch(() => null)

        if (text) {
          // Clean up series name - remove book count suffix and common noise
          const cleaned = text
            .replace(/\(\d+\s*books?\s*(?:series)?\)/i, '')
            .replace(/Kindle Edition/i, '')
            .replace(/\s+/g, ' ')
            .trim()

          console.log(`  Selector "${selector}" found: "${cleaned.substring(0, 50)}..."`)

          if (cleaned && isValidSeriesName(cleaned)) {
            console.log(`✅ Selected series name: "${cleaned}"`)
            return cleaned
          }
        }
      }
    } catch {
      continue
    }
  }

  console.log('⚠️ No valid series name found')
  return null
}

async function extractDescription(page: Page): Promise<string | null> {
  const selectors = [
    '#bookDescription_feature_div .a-expander-content',
    '#productDescription p',
    '.series-description',
    '[data-a-expander-name="book_description"]',
  ]

  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)

      if (isVisible) {
        const text = await element.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
        if (text) return text.trim().replace(/\s{2,}/g, ' ')
      }
    } catch {
      continue
    }
  }

  return null
}

async function extractTotalBooks(page: Page): Promise<number | null> {
  try {
    // Use page.evaluate for fast extraction
    const pageText = await page.evaluate(() => document.body?.textContent ?? '')
    if (!pageText) return null

    const patterns = [/(\d+)\s*books?\s*(?:in\s*(?:this\s*)?series)?/i, /\((\d+)\s*book\s*series\)/i, /series\s*\((\d+)\s*books?\)/i]

    for (const pattern of patterns) {
      const match = pageText.match(pattern)
      if (match) return parseInt(match[1], 10)
    }
  } catch {
    // Ignore
  }

  return null
}

async function extractCoverImage(page: Page): Promise<string | null> {
  const selectors = [
    '#seriesImageBlock', // img element has this id directly
    'img.a-dynamic-image[data-a-image-name="seriesImage"]', // fallback with attribute
    '.series-image img',
    '#imgTagWrapperId img',
  ]

  for (const selector of selectors) {
    try {
      const element = page.locator(selector).first()
      const isVisible = await element.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)

      if (isVisible) {
        // Try data-a-dynamic-image first (contains multiple sizes)
        const dynamicImage = await element.getAttribute('data-a-dynamic-image', { timeout: attributeTimeoutMs }).catch(() => null)
        if (dynamicImage) {
          const imageMap = JSON.parse(dynamicImage) as Record<string, unknown>
          const urls = Object.keys(imageMap)
          const largest = urls.sort((a, b) => extractImageSize(b) - extractImageSize(a))[0]
          if (largest) return largest
        }

        // Fallback to src
        const src = await element.getAttribute('src', { timeout: attributeTimeoutMs }).catch(() => null)
        if (src && !src.includes('data:')) return src
      }
    } catch {
      continue
    }
  }

  return null
}

async function extractPagination(page: Page): Promise<SeriesPagination | null> {
  console.log('🔍 Extracting pagination...')

  try {
    // Try to find pagination elements
    // Amazon uses various pagination patterns

    // Pattern 1: "Page X of Y" text (use evaluate for speed)
    const pageText = await page.evaluate(() => document.body?.textContent ?? '')
    let currentPage = 1
    let totalPages: number | null = null

    if (pageText) {
      const pagePattern = /Page\s+(\d+)\s+of\s+(\d+)/i
      const pageMatch = pageText.match(pagePattern)

      if (pageMatch) {
        currentPage = parseInt(pageMatch[1], 10)
        totalPages = parseInt(pageMatch[2], 10)
      }
    }

    // Pattern 2: Look for "Next" or ">" link/button
    const nextSelectors = [
      'a.s-pagination-next',
      'a[aria-label*="next" i]',
      'a[title*="next" i]',
      '.a-pagination li.a-last a',
      'a:has-text("Next")',
      'li.a-selected + li a', // Next sibling of selected page
    ]

    let nextPageUrl: string | null = null

    for (const selector of nextSelectors) {
      try {
        const nextLink = page.locator(selector).first()
        const isVisible = await nextLink.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)

        if (isVisible) {
          const href = await nextLink.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)

          if (href) {
            nextPageUrl = href.startsWith('http') ? href : `https://www.amazon.com${href}`
            console.log(`  Found next page link: ${nextPageUrl.substring(0, 80)}...`)
            break
          }
        }
      } catch {
        continue
      }
    }

    // If no explicit pagination found but we have totalBooks > books on page, there might be more
    if (!nextPageUrl && !totalPages) {
      console.log('  No pagination found (single page series)')
      return null
    }

    const pagination: SeriesPagination = {
      currentPage,
      totalPages,
      nextPageUrl,
    }

    console.log('✅ Pagination extracted:', pagination)
    return pagination
  } catch (error) {
    console.log('⚠️ Error extracting pagination:', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

async function extractBooks(page: Page): Promise<SeriesBookEntry[]> {
  const books: SeriesBookEntry[] = []

  // Wait for book list to load
  await page.waitForTimeout(1000)

  // Scroll to load lazy content
  await autoScroll(page)

  // Find book items - Amazon uses various structures
  const bookSelectors = [
    // Canonical series listing container
    '#series-childAsin-list .series-childAsin-item',
    // Fallbacks (still series-specific)
    '.series-childAsin-item',
    '[id^="series-childAsin-item_"]',
  ]

  for (const selector of bookSelectors) {
    try {
      const bookElements = await page.locator(selector).all()

      if (bookElements.length > 0) {
        console.log(`📚 Found ${bookElements.length} books with selector: ${selector}`)

        // Process elements with timeout protection
        const extractionPromises = bookElements.slice(0, 20).map(async (bookElement, index) => {
          try {
            console.log(`  Extracting book ${index + 1}/${Math.min(bookElements.length, 20)}...`)
            const entry = await Promise.race([
              extractBookEntry(bookElement),
              new Promise<SeriesBookEntry>((resolve) =>
                setTimeout(
                  () =>
                    resolve({
                      title: null,
                      asin: null,
                      amazonUrl: null,
                      position: null,
                      coverImageUrl: null,
                      format: 'unknown',
                      authors: [],
                      authorLinks: [],
                    }),
                  3000,
                ),
              ),
            ])
            return entry
          } catch (error) {
            console.log(`  ⚠️ Error extracting book ${index + 1}:`, error instanceof Error ? error.message : 'Unknown')
            return {
              title: null,
              asin: null,
              amazonUrl: null,
              position: null,
              coverImageUrl: null,
              format: 'unknown' as BookFormat,
              authors: [],
              authorLinks: [],
            }
          }
        })

        const entries = await Promise.all(extractionPromises)

        for (const entry of entries) {
          if (entry.title || entry.asin) {
            // Avoid duplicates by ASIN
            if (!books.some((b) => b.asin && b.asin === entry.asin)) {
              books.push(entry)
            }
          }
        }

        if (books.length > 0) {
          console.log(`✅ Successfully extracted ${books.length} books`)
          break
        }
      }
    } catch (error) {
      console.log(`⚠️ Selector ${selector} failed:`, error instanceof Error ? error.message : 'Unknown')
      continue
    }
  }

  // IMPORTANT:
  // Do NOT fall back to global link scraping here.
  // On non-series pages (or Kindle product pages), the DOM contains lots of unrelated
  // "similar items" modules (e.g. mes-dp) that look like book lists and cause leaks.

  // Deduplicate books by title/position, preferring hardcover > paperback > kindle
  console.log(`📚 Pre-dedup: ${books.length} total entries`)
  const deduplicated = deduplicateBooksByFormat(books)
  console.log(`📚 Post-dedup: ${deduplicated.length} unique books (preferred formats)`)

  // Sort by position if available
  deduplicated.sort((a, b) => (a.position ?? 999) - (b.position ?? 999))

  return deduplicated
}

async function assertLikelySeriesPage(page: Page): Promise<void> {
  const hasCollectionTitle = await page
    .locator('#collection-title')
    .first()
    .isVisible({ timeout: visibilityTimeoutMs })
    .catch(() => false)

  const seriesItemCount = await page
    .locator('#series-childAsin-list .series-childAsin-item, .series-childAsin-item, [id^="series-childAsin-item_"]')
    .count()
    .catch(() => 0)

  if (!hasCollectionTitle && seriesItemCount === 0) {
    throw new Error('Page does not look like an Amazon series page (missing series listing)')
  }
}

async function extractBookEntry(element: Locator): Promise<SeriesBookEntry> {
  let title: string | null = null
  let asin: string | null = null
  let amazonUrl: string | null = null
  let position: number | null = null
  let coverImageUrl: string | null = null
  const authors: string[] = []
  const authorLinks: AuthorLink[] = []

  try {
    // Get data from element attributes first (fastest)
    asin = await element.getAttribute('data-asin').catch(() => null)
    const elementId = await element.getAttribute('id').catch(() => null)
    const elementHtml = await element.innerHTML().catch(() => null)

    // Extract position from element ID (e.g., "series-childAsin-item_1" → 1)
    if (elementId) {
      const idMatch = elementId.match(/series-childAsin-item[_-](\d+)/i)
      if (idMatch) {
        const idPosition = parseInt(idMatch[1], 10)
        if (idPosition >= 1 && idPosition <= 100) position = idPosition
      }
    }

    // Extract position from data attributes
    if (!position) {
      const dataAttributes = await element
        .evaluate((el: Element) => {
          const attrs: Record<string, string> = {}
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i]
            if (attr.name.startsWith('data-')) attrs[attr.name] = attr.value
          }
          return attrs
        })
        .catch(() => null)

      if (dataAttributes) {
        for (const key of Object.keys(dataAttributes)) {
          const value = dataAttributes[key]
          if (key.toLowerCase().includes('position') || key.toLowerCase().includes('index') || key.toLowerCase().includes('order')) {
            const numValue = parseInt(value, 10)
            if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
              position = numValue
              break
            }
          }
        }
      }
    }

    // HTML-based extraction
    if (elementHtml) {
      if (!asin) asin = extractAsinFromHtml(elementHtml)

      // Extract URL, ASIN, title, position from link elements in HTML
      const linkPattern =
        /<a[^>]+href=["']([^"']*(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})[^"']*)["'][^>]*(?:title=["']([^"']+)["'])?[^>]*>/gi
      const linkMatches = elementHtml.matchAll(linkPattern)

      for (const match of linkMatches) {
        const fullUrl = match[1]
        const extractedAsin = match[2]
        const titleAttr = match[3]?.trim()

        if (fullUrl && !amazonUrl) {
          amazonUrl = fullUrl.startsWith('http') ? fullUrl : `https://www.amazon.com${fullUrl}`
        }

        if (!asin && extractedAsin) asin = extractedAsin
        if (!position && fullUrl) position = extractPositionFromUrl(fullUrl)

        if (titleAttr) {
          if (!position) position = extractPositionFromText(titleAttr)
          if (!title) title = cleanBookTitle(titleAttr)
        }

        if (amazonUrl && asin && title && position) break
      }

      // Fallback: extract ASIN from any URL in HTML
      if (!asin) asin = extractAsinFromHtml(elementHtml)

      // Fallback: extract title from headings
      if (!title) {
        const headingMatch = elementHtml.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i)
        if (headingMatch) title = cleanBookTitle(headingMatch[1])
      }

      // Extract cover image
      const imgMatch = elementHtml.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (imgMatch) {
        const imgSrc = imgMatch[1]
        if (!imgSrc.includes('data:') && !imgSrc.includes('pixel') && imgSrc.length > 20) {
          coverImageUrl = imgSrc
        }
      }

      // Extract authors from HTML
      const htmlAuthors = extractAuthorsFromHtml(elementHtml)
      authors.push(...htmlAuthors.names.filter((n) => !authors.includes(n)))
      authorLinks.push(...htmlAuthors.links.filter((l) => !authorLinks.some((al) => al.url === l.url)))
    }

    // Fallback: extract position from surrounding text
    if (!position) {
      const elementText = await element.textContent().catch(() => null)
      const parentText = await element
        .locator('..')
        .textContent()
        .catch(() => null)
      const allText = [elementText, parentText].filter(Boolean).join(' ')
      if (allText) position = extractPositionFromText(allText)
    }

    // Fallback: element-based extraction if HTML parsing incomplete
    if (!title || !asin || !amazonUrl) {
      await extractBookDataFromElement(element, { title, asin, amazonUrl, position }, (data) => {
        if (!title && data.title) title = data.title
        if (!asin && data.asin) asin = data.asin
        if (!amazonUrl && data.amazonUrl) amazonUrl = data.amazonUrl
        if (!position && data.position) position = data.position
      })
    }

    // Fallback: author extraction from element
    if (authors.length === 0 || authorLinks.length === 0) {
      const elementAuthors = await extractAuthorsFromElement(element)
      authors.push(...elementAuthors.names.filter((n) => !authors.includes(n)))
      authorLinks.push(...elementAuthors.links.filter((l) => !authorLinks.some((al) => al.url === l.url)))
    }

    // Construct URL from ASIN if missing
    if (!amazonUrl && asin) amazonUrl = `https://www.amazon.com/dp/${asin}`

    // Final title cleanup
    if (title) title = cleanBookTitle(title)
  } catch {
    // Extraction errors expected for some elements
  }

  const format = detectFormat({ title, asin, url: amazonUrl })
  return { title, asin, amazonUrl, position, coverImageUrl, format, authors, authorLinks }
}

async function extractBookDataFromElement(
  element: Locator,
  current: { title: string | null; asin: string | null; amazonUrl: string | null; position: number | null },
  update: (data: Partial<typeof current>) => void,
): Promise<void> {
  // Try to get ASIN from child elements
  if (!current.asin) {
    const asinElement = element.locator('[data-asin]').first()
    const isVisible = await asinElement.isVisible({ timeout: 500 }).catch(() => false)
    if (isVisible) {
      const dataAsin = await asinElement.getAttribute('data-asin').catch(() => null)
      if (dataAsin && /^[A-Z0-9]{10}$/.test(dataAsin)) {
        update({ asin: dataAsin })
      }
    }
  }

  // Try link selectors
  const linkSelectors = ['a[href*="/dp/"]', 'a[href*="/gp/product/"]', 'a[href*="asin="]']

  for (const selector of linkSelectors) {
    try {
      const linkElement = element.locator(selector).first()
      const isVisible = await linkElement.isVisible({ timeout: 500 }).catch(() => false)
      if (!isVisible) continue

      const href = await linkElement.getAttribute('href').catch(() => null)
      const titleAttr = await linkElement.getAttribute('title').catch(() => null)

      if (href) {
        if (!current.amazonUrl) {
          update({ amazonUrl: href.startsWith('http') ? href : `https://www.amazon.com${href}` })
        }

        if (!current.asin) {
          const asin = extractAsin(href)
          if (asin) update({ asin })
        }

        if (!current.position) {
          const position = extractPositionFromUrl(href)
          if (position) update({ position })
        }
      }

      if (titleAttr) {
        if (!current.position) {
          const position = extractPositionFromText(titleAttr)
          if (position) update({ position })
        }

        if (!current.title) {
          const title = cleanBookTitle(titleAttr)
          if (title) update({ title })
        }
      }

      // Extract title from link text as last resort
      if (!current.title) {
        const linkText = await linkElement.textContent({ timeout: 500 }).catch(() => null)
        if (linkText) {
          const title = cleanBookTitle(linkText)
          if (title && title !== 'Kindle') update({ title })
        }
      }

      if (current.asin && current.amazonUrl) break
    } catch {
      continue
    }
  }
}

async function extractBookLinks(page: Page): Promise<SeriesBookEntry[]> {
  const books: SeriesBookEntry[] = []
  const seenAsins = new Set<string>()

  try {
    const links = await page.locator('a[href*="/dp/"]').all()

    for (const link of links) {
      try {
        const href = await link.getAttribute('href')
        if (!href) continue

        const asin = extractAsin(href)
        if (!asin || seenAsins.has(asin)) continue
        seenAsins.add(asin)

        const title = await link.textContent()
        if (!title?.trim()) continue

        const parentText = await link
          .locator('..')
          .textContent()
          .catch(() => null)
        const position = parentText ? extractPositionFromText(parentText) : null

        const parentElement = link.locator('..')
        const { names: authors, links: authorLinks } = await extractAuthorsFromElement(parentElement)

        const format = detectFormat({ title: title.trim(), asin, url: href })

        books.push({
          title: title.trim(),
          asin,
          amazonUrl: href.startsWith('http') ? href : `https://www.amazon.com${href}`,
          position,
          coverImageUrl: null,
          format,
          authors,
          authorLinks,
        })
      } catch {
        continue
      }
    }
  } catch {
    // Ignore errors
  }

  return books
}

// --- Format detection helpers ---

function detectFormat(params: { title: string | null; asin: string | null; url: string | null }): BookFormat {
  const { title, asin, url } = params
  const combined = `${title ?? ''} ${url ?? ''}`.toLowerCase()

  // Check for explicit format mentions
  if (combined.includes('hardcover')) return 'hardcover'
  if (combined.includes('paperback') || combined.includes('mass market')) return 'paperback'
  if (combined.includes('kindle') || combined.includes('ebook')) return 'kindle'
  if (combined.includes('audiobook') || combined.includes('audible')) return 'audiobook'

  // Check URL for binding parameter
  if (url) {
    const bindingMatch = url.match(/binding=(\w+)/i)
    if (bindingMatch) {
      const binding = bindingMatch[1].toLowerCase()
      if (binding === 'hardcover') return 'hardcover'
      if (binding === 'paperback') return 'paperback'
      if (binding === 'kindle') return 'kindle'
    }
  }

  // ASIN heuristics: Kindle ASINs typically start with B0
  if (asin && asin.startsWith('B0')) return 'kindle'

  // Physical book ASINs are usually 10-digit ISBNs (start with digit)
  if (asin && /^\d{10}$/.test(asin)) return 'paperback' // Assume paperback for ISBN-style

  return 'unknown'
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove parenthetical content (format info)
    .replace(/hardcover|paperback|kindle|edition|ebook|audiobook/gi, '')
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function deduplicateBooksByFormat(books: SeriesBookEntry[]): SeriesBookEntry[] {
  // Group books by normalized title + position
  const groups = new Map<string, SeriesBookEntry[]>()

  for (const book of books) {
    if (!book.title) continue

    const normalizedTitle = normalizeTitle(book.title)
    const key = `${normalizedTitle}-${book.position ?? 'nopos'}`

    const existing = groups.get(key) ?? []
    existing.push(book)
    groups.set(key, existing)
  }

  // For each group, pick the best format
  const deduplicated: SeriesBookEntry[] = []

  for (const [key, group] of Array.from(groups.entries())) {
    // Filter out audiobooks entirely
    const nonAudiobooks = group.filter((b) => b.format !== 'audiobook')
    if (nonAudiobooks.length === 0) continue

    // Sort by format priority (highest first)
    nonAudiobooks.sort((a, b) => FORMAT_PRIORITY[b.format] - FORMAT_PRIORITY[a.format])

    const best = nonAudiobooks[0]
    console.log(`  📖 Dedup "${key}": picked ${best.format} (ASIN: ${best.asin}) from ${group.length} editions`)
    deduplicated.push(best)
  }

  // Also include books without titles but with ASINs (rare edge case)
  for (const book of books) {
    if (!book.title && book.asin && book.format !== 'audiobook') {
      if (!deduplicated.some((b) => b.asin === book.asin)) {
        deduplicated.push(book)
      }
    }
  }

  return deduplicated
}

// --- Book entry extraction helpers ---

function extractAsinFromHtml(html: string): string | null {
  // Try data-asin attribute first
  const dataAsinMatch = html.match(/data-asin=["']([A-Z0-9]{10})["']/i)
  if (dataAsinMatch) return dataAsinMatch[1].toUpperCase()

  // Try URL patterns
  for (const pattern of ASIN_URL_PATTERNS) {
    const match = html.match(pattern)
    if (match) return match[1].toUpperCase()
  }

  return null
}

function extractPositionFromText(text: string): number | null {
  for (const pattern of TEXT_POSITION_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const value = parseInt(match[1], 10)
      if (value >= 1 && value <= 100) return value
    }
  }
  return null
}

function extractPositionFromUrl(url: string): number | null {
  const match = url.match(URL_REF_POSITION_PATTERN)
  if (match) {
    const refIndex = parseInt(match[1], 10)
    if (refIndex >= 0 && refIndex < 100) return refIndex + 1
  }
  return null
}

function cleanBookTitle(rawTitle: string): string | null {
  const cleaned = rawTitle
    .replace(/#\d+/g, '')
    .replace(/Book\s+\d+/gi, '')
    .replace(/\s*\([^)]+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= 3 || /^\d+$/.test(cleaned)) return null
  return cleaned
}

interface ExtractedAuthors {
  names: string[]
  links: AuthorLink[]
}

function extractAuthorsFromHtml(html: string): ExtractedAuthors {
  const names: string[] = []
  const links: AuthorLink[] = []
  const seenAuthorIds = new Set<string>()

  const authorLinkPattern = /<a[^>]+href=["']([^"']*(?:\/author\/|\/e\/)[^"']*)["'][^>]*>([^<]+)<\/a>/gi
  const matches = Array.from(html.matchAll(authorLinkPattern))

  for (const match of matches) {
    const authorUrl = match[1]?.trim()
    const authorName = match[2]?.trim()

    if (!authorName || authorName.length <= 1) continue

    if (!names.includes(authorName)) {
      names.push(authorName)
    }

    if (authorUrl) {
      const fullUrl = authorUrl.startsWith('http') ? authorUrl : `https://www.amazon.com${authorUrl}`
      const authorId = extractAuthorId(fullUrl)

      if (authorId && !seenAuthorIds.has(authorId)) {
        seenAuthorIds.add(authorId)
        // Normalize URL to strip query params for consistent deduplication
        links.push({ name: authorName, url: normalizeAmazonUrl(fullUrl) })
      }
    }
  }

  // Fallback: "by Author Name" pattern
  if (names.length === 0) {
    const byMatch = html.match(/(?:by|By)\s+([A-Z][a-zA-Z\s]+?)(?:\s*[|,;]|\s*$|<\/)/i)
    if (byMatch) {
      const authorName = byMatch[1]?.trim()
      if (authorName && authorName.length > 1) {
        names.push(authorName)
      }
    }
  }

  return { names, links }
}

async function extractAuthorsFromElement(element: Locator): Promise<ExtractedAuthors> {
  const names: string[] = []
  const links: AuthorLink[] = []
  const seenAuthorIds = new Set<string>()

  const authorSelectors = ['a[href*="/author/"]', 'a[href*="/e/"]']

  for (const selector of authorSelectors) {
    try {
      const authorElements = await element.locator(selector).all()

      for (const authorElement of authorElements) {
        const isVisible = await authorElement.isVisible({ timeout: 500 }).catch(() => false)
        if (!isVisible) continue

        const authorName = await authorElement.textContent({ timeout: 500 }).catch(() => null)
        const trimmedName = authorName?.trim()
        if (!trimmedName || trimmedName.length <= 1) continue

        if (!names.includes(trimmedName)) {
          names.push(trimmedName)
        }

        const href = await authorElement.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)
        if (href) {
          const fullUrl = href.startsWith('http') ? href : `https://www.amazon.com${href}`
          const authorId = extractAuthorId(fullUrl)

          if (authorId && !seenAuthorIds.has(authorId)) {
            seenAuthorIds.add(authorId)
            // Normalize URL to strip query params for consistent deduplication
            links.push({ name: trimmedName, url: normalizeAmazonUrl(fullUrl) })
          }
        }
      }

      if (names.length > 0) break
    } catch {
      continue
    }
  }

  return { names, links }
}

// --- Utility helpers ---

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0
      const distance = 300
      const maxScrolls = 10
      let scrollCount = 0

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance
        scrollCount++

        if (totalHeight >= scrollHeight || scrollCount >= maxScrolls) {
          clearInterval(timer)
          window.scrollTo(0, 0) // Scroll back to top
          resolve()
        }
      }, 100)
    })
  })
}

function extractImageSize(url: string): number {
  const match = url.match(/_S[XLY](\d+)_/)
  return match ? parseInt(match[1], 10) : 0
}
