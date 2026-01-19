import type { Page } from 'playwright'
import { SeriesData, SeriesBookEntry, SeriesPagination, BookFormat, AuthorLink } from './types'
import { FORMAT_PRIORITY } from '../book/types'
import { dumpPageHtml } from '../../utils/html-dump'
import { SCRAPING_CONFIG } from '../../config'
import { extractAsin } from '../../utils/amazon-url'

const { visibilityTimeoutMs, textContentTimeoutMs, attributeTimeoutMs } = SCRAPING_CONFIG.extraction

/**
 * Parse series data from an Amazon series page using Playwright.
 * Extracts series name, description, total books, and book list.
 */
export async function parseSeriesFromPage(page: Page): Promise<SeriesData> {
  console.log('🌀 Parsing Amazon series page...')

  // Dump HTML for debugging
  await dumpPageHtml(page, `series_${extractAsin(page.url()) ?? 'unknown'}`)

  const name = await extractSeriesName(page)
  const description = await extractDescription(page)
  const totalBooks = await extractTotalBooks(page)
  const coverImageUrl = await extractCoverImage(page)
  const asin = extractAsinFromUrl(page.url())
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

    const patterns = [
      /(\d+)\s*books?\s*(?:in\s*(?:this\s*)?series)?/i,
      /\((\d+)\s*book\s*series\)/i,
      /series\s*\((\d+)\s*books?\)/i,
    ]

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
    '.series-image img',
    '#seriesImageBlock img',
    '#imgTagWrapperId img',
    '.a-dynamic-image',
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
    '.series-childAsin-item',
    '[data-asin]:has(a[href*="/dp/"])',
    '.a-carousel-card:has(a[href*="/dp/"])',
    '.a-section:has(a[href*="/dp/"]):has(img)',
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
                setTimeout(() => resolve({ title: null, asin: null, amazonUrl: null, position: null, coverImageUrl: null, format: 'unknown', authors: [], authorLinks: [] }), 3000)
              ),
            ])
            return entry
          } catch (error) {
            console.log(`  ⚠️ Error extracting book ${index + 1}:`, error instanceof Error ? error.message : 'Unknown')
            return { title: null, asin: null, amazonUrl: null, position: null, coverImageUrl: null, format: 'unknown' as BookFormat, authors: [], authorLinks: [] }
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

  // If we didn't find structured book elements, try finding all book links
  if (books.length === 0) {
    console.log('🔍 Falling back to link extraction...')
    const bookLinks = await extractBookLinks(page)
    books.push(...bookLinks)
  }

  // Deduplicate books by title/position, preferring hardcover > paperback > kindle
  console.log(`📚 Pre-dedup: ${books.length} total entries`)
  const deduplicated = deduplicateBooksByFormat(books)
  console.log(`📚 Post-dedup: ${deduplicated.length} unique books (preferred formats)`)

  // Sort by position if available
  deduplicated.sort((a, b) => (a.position ?? 999) - (b.position ?? 999))

  return deduplicated
}

async function extractBookEntry(element: any): Promise<SeriesBookEntry> {
  let title: string | null = null
  let asin: string | null = null
  let amazonUrl: string | null = null
  let position: number | null = null
  let coverImageUrl: string | null = null
  let format: BookFormat = 'unknown'
  const authors: string[] = []
  const authorLinks: AuthorLink[] = []

  try {
    // FIRST: Try to get ASIN directly from element's data-asin attribute (fastest)
    try {
      asin = await element.getAttribute('data-asin')
    } catch {
      // Ignore
    }

    // Get HTML for more detailed extraction
    const elementHtml = await element.innerHTML().catch(() => null)

    // Also try to get outerHTML and check for data attributes
    const elementId = await element.getAttribute('id').catch(() => null)
    const dataAttributes = await element.evaluate((el: Element) => {
      const attrs: Record<string, string> = {}
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          attrs[attr.name] = attr.value
        }
      }
      return attrs
    }).catch(() => null)

    // FIRST PRIORITY: Extract position from element ID (e.g., "series-childAsin-item_1" → 1)
    if (!position && elementId) {
      const idMatch = elementId.match(/series-childAsin-item[_-](\d+)/i)
      if (idMatch) {
        const idPosition = parseInt(idMatch[1], 10)
        if (idPosition >= 1 && idPosition <= 100) {
          position = idPosition
        }
      }
    }

    // Check data attributes for position
    if (!position && dataAttributes) {
      for (const [key, value] of Object.entries(dataAttributes)) {
        if (key.toLowerCase().includes('position') || key.toLowerCase().includes('index') || key.toLowerCase().includes('order')) {
          const numValue = parseInt(value, 10)
          if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
            position = numValue
            break
          }
        }
      }
    }

    if (elementHtml) {
      // If we don't have ASIN yet, try to get it from data-asin in HTML
      if (!asin) {
        const dataAsinMatches = elementHtml.matchAll(/data-asin=["']([A-Z0-9]{10})["']/gi)
        for (const match of dataAsinMatches) {
          asin = match[1]
          break // Take first one
        }
      }

      // SECOND: Extract URL, ASIN, title, and position from links and their attributes
      // Try multiple URL patterns: /dp/, /gp/product/, etc.
      const linkPatterns = [
        /<a[^>]+href=["']([^"']*\/dp\/([A-Z0-9]{10})[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>/gi,
        /<a[^>]+href=["']([^"']*\/gp\/product\/([A-Z0-9]{10})[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>/gi,
        /<a[^>]+href=["']([^"']*\/[^"']*asin=([A-Z0-9]{10})[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>/gi,
      ]

      for (const pattern of linkPatterns) {
        const linkMatches = elementHtml.matchAll(pattern)
        for (const match of linkMatches) {
          const fullUrl = match[1]
          const extractedAsin = match[2]
          const titleAttr = match[3]?.trim()

          // Extract full URL
          if (fullUrl && !amazonUrl) {
            amazonUrl = fullUrl.startsWith('http') ? fullUrl : `https://www.amazon.com${fullUrl}`
          }

          // Extract ASIN if we don't have it yet
          if (!asin && extractedAsin) {
            asin = extractedAsin
          }

          // Extract position from URL ref parameter (e.g., ref_=dbs_m_mng_rwt_calw_thcv_0 → position 1)
          if (!position && fullUrl) {
            const refMatch = fullUrl.match(/ref_=dbs_m_mng_rwt_calw_thcv_(\d+)/i)
            if (refMatch) {
              const refIndex = parseInt(refMatch[1], 10)
              // ref parameter is 0-indexed, convert to 1-indexed position
              if (refIndex >= 0 && refIndex < 100) {
                position = refIndex + 1
              }
            }
          }

          // Extract title and position from title attribute
          if (titleAttr) {
            // Extract position from title attribute (e.g., "#1", "#2", "Book 1")
            if (!position) {
              const posMatch = titleAttr.match(/#(\d+)|Book\s+(\d+)/i)
              if (posMatch) {
                position = parseInt(posMatch[1] || posMatch[2], 10)
              }
            }

            // Extract title - remove position info and series names but keep raw title from Amazon
            if (!title) {
              let cleanTitle = titleAttr
                .replace(/#\d+/g, '') // Remove #1, #2, etc.
                .replace(/Book\s+\d+/gi, '') // Remove "Book 1", etc.
                .replace(/\s*\([^)]+\)\s*$/, '') // Remove trailing parentheses (series names)
                .replace(/\s+/g, ' ')
                .trim()

              if (cleanTitle.length > 3) {
                title = cleanTitle
              }
            }
          }

          // If we got everything, break
          if (amazonUrl && asin && title && position) break
        }
        if (amazonUrl && asin && title && position) break
      }

      // THIRD: If we still don't have ASIN, try extracting from any URL pattern in the HTML
      if (!asin) {
        const urlPatterns = [
          /\/dp\/([A-Z0-9]{10})/,
          /\/gp\/product\/([A-Z0-9]{10})/,
          /[?&]asin=([A-Z0-9]{10})/i,
        ]

        for (const pattern of urlPatterns) {
          const match = elementHtml.match(pattern)
          if (match) {
            asin = match[1]
            break
          }
        }
      }

      // If no title from link, try h2 or other headings
      if (!title) {
        const headingMatch = elementHtml.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i)
        if (headingMatch) {
          let headingText = headingMatch[1]
            .trim()
            .replace(/\s*\([^)]+\)\s*$/, '') // Remove trailing parentheses (series names)
            .trim()
          if (headingText.length > 3 && !/^\d+$/.test(headingText)) {
            title = headingText
          }
        }
      }

      // Extract position from text patterns (only if not already found from title attribute)
      // Be more specific to avoid matching CSS pixel values (170px, etc.)
      if (!position) {
        // Also check element's text content and parent/sibling text
        const elementText = await element.textContent().catch(() => null)
        const parentText = await element.locator('..').textContent().catch(() => null)
        const previousSiblingText = await element.evaluate((el: Element) => {
          const prev = el.previousElementSibling
          return prev?.textContent || null
        }).catch(() => null)

        // Try to find position in text content
        const allText = [elementText, parentText, previousSiblingText].filter(Boolean).join(' ')
        if (allText) {
          const textPosPatterns = [
            /(?:Book|#)\s*(\d+)(?:\s|$|\)|,|of)/i,
            /(\d+)\s*(?:of|in)\s*(?:this\s*)?series/i,
            /position\s*(\d+)/i,
            /#(\d+)/i,
          ]
          for (const pattern of textPosPatterns) {
            const match = allText.match(pattern)
            if (match) {
              const value = parseInt(match[1], 10)
              if (value >= 1 && value <= 100) {
                position = value
                break
              }
            }
          }
        }

        const positionPatterns = [
          /(?:Book\s+)?#(\d+)(?:\s|$|\))/i, // Match #1, #2, etc. but not 170px
          /Book\s+(\d+)(?:\s|$|\))/i, // Match "Book 1", "Book 2", etc.
          /(\d+)\s*(?:of|in)\s+this\s+series/i, // Match "1 of this series"
        ]

        for (const pattern of positionPatterns) {
          const match = elementHtml.match(pattern)
          if (match) {
            const value = parseInt(match[1], 10)
            // Only accept reasonable position values (1-100, not CSS values like 170)
            if (value >= 1 && value <= 100) {
              position = value
              break
            }
          }
        }
      }

      // Extract cover image
      const imgMatches = elementHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
      for (const match of imgMatches) {
        const imgSrc = match[1]
        // Skip data URIs and very small images
        if (!imgSrc.includes('data:') && !imgSrc.includes('pixel') && imgSrc.length > 20) {
          coverImageUrl = imgSrc
          break
        }
      }

      // Extract authors from HTML
      // Look for author links (href contains /author/ or /e/)
      const authorLinkPattern = /<a[^>]+href=["']([^"']*(?:\/author\/|\/e\/)[^"']*)["'][^>]*>([^<]+)<\/a>/gi
      const authorMatches = elementHtml.matchAll(authorLinkPattern)
      for (const match of authorMatches) {
        const authorUrl = match[1]?.trim()
        const authorName = match[2]?.trim()
        
        if (authorName && authorName.length > 1 && !authors.includes(authorName)) {
          authors.push(authorName)
        }
        
        if (authorUrl && authorName && authorName.length > 1) {
          // Build full URL, preserving the original path format (including /e/ and slug)
          const fullAuthorUrl = authorUrl.startsWith('http')
            ? authorUrl
            : `https://www.amazon.com${authorUrl}`
          
          // Normalize by extracting author ID for deduplication
          const authorIdMatch = fullAuthorUrl.match(/\/(?:author|e)\/([A-Z0-9]+)/i)
          const authorId = authorIdMatch?.[1]?.toUpperCase()
          
          // Only add if not already present (by author ID to avoid duplicates with different URL formats)
          if (authorId && !authorLinks.some((link) => link.url.includes(authorId))) {
            authorLinks.push({ name: authorName, url: fullAuthorUrl })
          }
        }
      }

      // Fallback: look for "by Author Name" pattern in text
      if (authors.length === 0) {
        const byPattern = /(?:by|By)\s+([A-Z][a-zA-Z\s]+?)(?:\s*[|,;]|\s*$|<\/)/i
        const byMatch = elementHtml.match(byPattern)
        if (byMatch) {
          const authorName = byMatch[1]?.trim()
          if (authorName && authorName.length > 1) {
            authors.push(authorName)
          }
        }
      }
    }

    // Fallback: try using element methods if HTML parsing didn't work
    if (!title || !asin || !amazonUrl) {
      try {
        // Try to get ASIN from child elements with data-asin
        if (!asin) {
          const asinElement = element.locator('[data-asin]').first()
          const asinVisible = await asinElement.isVisible({ timeout: 500 }).catch(() => false)
          if (asinVisible) {
            const dataAsin = await asinElement.getAttribute('data-asin').catch(() => null)
            if (dataAsin && /^[A-Z0-9]{10}$/.test(dataAsin)) {
              asin = dataAsin
            }
          }
        }

        // Try to find link elements with multiple patterns
        const linkSelectors = [
          'a[href*="/dp/"]',
          'a[href*="/gp/product/"]',
          'a[href*="asin="]',
          'a[href*="dp/"]', // More flexible
        ]

        for (const selector of linkSelectors) {
          try {
            const linkElement = element.locator(selector).first()
            const linkVisible = await linkElement.isVisible({ timeout: 500 }).catch(() => false)

            if (linkVisible) {
              const href = await linkElement.getAttribute('href').catch(() => null)
              const titleAttr = await linkElement.getAttribute('title').catch(() => null)

              if (href) {
                // Extract full URL
                if (!amazonUrl) {
                  amazonUrl = href.startsWith('http') ? href : `https://www.amazon.com${href}`
                }

                // Extract ASIN from URL
                if (!asin) {
                  const patterns = [
                    /\/dp\/([A-Z0-9]{10})/,
                    /\/gp\/product\/([A-Z0-9]{10})/,
                    /[?&]asin=([A-Z0-9]{10})/i,
                  ]
                  for (const pattern of patterns) {
                    const match = href.match(pattern)
                    if (match) {
                      asin = match[1]
                      break
                    }
                  }
                }

                // Extract position from URL ref parameter (fallback)
                if (!position && href) {
                  const refMatch = href.match(/ref_=dbs_m_mng_rwt_calw_thcv_(\d+)/i)
                  if (refMatch) {
                    const refIndex = parseInt(refMatch[1], 10)
                    // ref parameter is 0-indexed, convert to 1-indexed position
                    if (refIndex >= 0 && refIndex < 100) {
                      position = refIndex + 1
                    }
                  }
                }
              }

              // Extract title and position from title attribute (preferred)
              if (titleAttr) {
                // Extract position
                if (!position) {
                  const posMatch = titleAttr.match(/#(\d+)|Book\s+(\d+)/i)
                  if (posMatch) {
                    const posValue = parseInt(posMatch[1] || posMatch[2], 10)
                    if (posValue >= 1 && posValue <= 100) {
                      position = posValue
                    }
                  }
                }

                // Extract title - remove position info and series names but keep raw title
                if (!title) {
                  let cleanTitle = titleAttr
                    .replace(/#\d+/g, '')
                    .replace(/Book\s+\d+/gi, '')
                    .replace(/\s*\([^)]+\)\s*$/, '') // Remove trailing parentheses (series names)
                    .replace(/\s+/g, ' ')
                    .trim()

                  if (cleanTitle.length > 3) {
                    title = cleanTitle
                  }
                }
              }

              // Fallback: Extract title from link text if title attribute didn't work
              if (!title) {
                const linkText = await linkElement.textContent({ timeout: 500 }).catch(() => null)
                if (linkText && linkText.trim().length > 3 && !/^\d+$/.test(linkText.trim()) && linkText.trim() !== 'Kindle') {
                  let cleanTitle = linkText
                    .trim()
                    .replace(/\s*\([^)]+\)\s*$/, '') // Remove trailing parentheses (series names)
                    .trim()
                  if (cleanTitle.length > 3) {
                    title = cleanTitle
                  }
                }
              }

              // If we got what we need, break
              if (asin && amazonUrl) break
            }
          } catch {
            continue
          }
        }

        // Extract authors using element methods (fallback if HTML parsing didn't work)
        // Try to find author links if we have neither or if we have names but no links
        if (authors.length === 0 || authorLinks.length === 0) {
          try {
            // Look for author links within the element
            const authorSelectors = [
              'a[href*="/author/"]',
              'a[href*="/e/"]',
              '.a-link-normal[href*="/author/"]',
            ]

            for (const selector of authorSelectors) {
              try {
                const authorElements = await element.locator(selector).all()
                for (const authorElement of authorElements) {
                  const authorVisible = await authorElement.isVisible({ timeout: 500 }).catch(() => false)
                  if (authorVisible) {
                    const authorName = await authorElement.textContent({ timeout: 500 }).catch(() => null)
                    const trimmedName = authorName?.trim()
                    
                    if (trimmedName && trimmedName.length > 1) {
                      if (!authors.includes(trimmedName)) {
                        authors.push(trimmedName)
                      }
                      
                      // Extract author URL and pair with name (preserving original URL format with slug)
                      const href = await authorElement.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)
                      if (href) {
                        const fullAuthorUrl = href.startsWith('http')
                          ? href
                          : `https://www.amazon.com${href}`
                        
                        // Extract author ID for deduplication
                        const authorIdMatch = fullAuthorUrl.match(/\/(?:author|e)\/([A-Z0-9]+)/i)
                        const authorId = authorIdMatch?.[1]?.toUpperCase()
                        
                        if (authorId && !authorLinks.some((link) => link.url.includes(authorId))) {
                          authorLinks.push({ name: trimmedName, url: fullAuthorUrl })
                        }
                      }
                    }
                  }
                }
                // Break if we found authors
                if (authors.length > 0) break
              } catch {
                continue
              }
            }
          } catch {
            // Ignore
          }
        }
      } catch {
        // Ignore
      }
    }

    // Construct URL from ASIN if we have ASIN but no URL
    if (!amazonUrl && asin) {
      amazonUrl = `https://www.amazon.com/dp/${asin}`
    }

    // Clean up title - normalize whitespace and remove series names
    if (title) {
      title = title
        .replace(/\s+/g, ' ')
        .replace(/\s*\([^)]+\)\s*$/, '') // Remove trailing parentheses (series names)
        .trim()

      // If title is still just a number, set to null
      if (/^\d+$/.test(title)) {
        title = null
      }
    }
  } catch {
    // Extraction errors are expected for some elements, silently continue
  }

  // Detect format from extracted data
  format = detectFormat({ title, asin, url: amazonUrl })

  return { title, asin, amazonUrl, position, coverImageUrl, format, authors, authorLinks }
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

        const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/)
        if (!asinMatch) continue

        const asin = asinMatch[1]
        if (seenAsins.has(asin)) continue
        seenAsins.add(asin)

        const title = await link.textContent()

        // Try to find position in nearby text
        let position: number | null = null
        const parentText = await link.locator('..').textContent().catch(() => null)
        if (parentText) {
          const posMatch = parentText.match(/(?:Book\s*)?#?(\d+)/i)
          if (posMatch) position = parseInt(posMatch[1], 10)
        }

        if (title?.trim()) {
          const format = detectFormat({ title: title.trim(), asin, url: href })
          
          // Try to extract authors from nearby elements
          const authors: string[] = []
          const authorLinks: AuthorLink[] = []
          try {
            const authorElements = await link.locator('..').locator('a[href*="/author/"], a[href*="/e/"]').all()
            for (const authorElement of authorElements) {
              const authorName = await authorElement.textContent().catch(() => null)
              const trimmedName = authorName?.trim()
              
              if (trimmedName && trimmedName.length > 1) {
                if (!authors.includes(trimmedName)) {
                  authors.push(trimmedName)
                }
                
                // Extract author URL and pair with name (preserving original URL format with slug)
                const authorHref = await authorElement.getAttribute('href').catch(() => null)
                if (authorHref) {
                  const fullAuthorUrl = authorHref.startsWith('http')
                    ? authorHref
                    : `https://www.amazon.com${authorHref}`
                  
                  // Extract author ID for deduplication
                  const authorIdMatch = fullAuthorUrl.match(/\/(?:author|e)\/([A-Z0-9]+)/i)
                  const authorId = authorIdMatch?.[1]?.toUpperCase()
                  
                  if (authorId && !authorLinks.some((link) => link.url.includes(authorId))) {
                    authorLinks.push({ name: trimmedName, url: fullAuthorUrl })
                  }
                }
              }
            }
          } catch {
            // Ignore
          }

          books.push({
            title: title.trim(),
            asin,
            amazonUrl: href ? (href.startsWith('http') ? href : `https://www.amazon.com${href}`) : null,
            position,
            coverImageUrl: null,
            format,
            authors,
            authorLinks,
          })
        }
      } catch {
        continue
      }
    }
  } catch {
    // Ignore
  }

  return books
}

// --- Format detection helpers ---

function detectFormat(params: {
  title: string | null
  asin: string | null
  url: string | null
}): BookFormat {
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

  for (const [key, group] of groups) {
    // Filter out audiobooks entirely
    const nonAudiobooks = group.filter((b) => b.format !== 'audiobook')
    if (nonAudiobooks.length === 0) continue

    // Sort by format priority (highest first)
    nonAudiobooks.sort((a, b) => FORMAT_PRIORITY[b.format] - FORMAT_PRIORITY[a.format])

    const best = nonAudiobooks[0]
    console.log(
      `  📖 Dedup "${key}": picked ${best.format} (ASIN: ${best.asin}) from ${group.length} editions`
    )
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

function extractAsinFromUrl(url: string): string | null {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/)
  return match?.[1] ?? null
}

function extractImageSize(url: string): number {
  const match = url.match(/_S[XLY](\d+)_/)
  return match ? parseInt(match[1], 10) : 0
}
