import type { Page } from 'playwright'
import { BookData, BookFormat, FORMAT_PRIORITY } from './types'
import { extractAsinFromUrl, normalizeAmazonUrl } from '../../utils/amazon-url'
import { dumpPageHtml } from '../../utils/html-dump'
import { SCRAPING_CONFIG } from '../../config'

const { visibilityTimeoutMs, textContentTimeoutMs, attributeTimeoutMs } = SCRAPING_CONFIG.extraction

/**
 * Parse book data from an Amazon product page using Playwright.
 * Extracts title, authors, ISBNs, series info, formats, etc.
 */
export async function parseBookFromPage(page: Page): Promise<BookData> {
  console.log('🌀 Parsing Amazon book page...')

  // Dump HTML for debugging
  await dumpPageHtml(page, `book_${extractAsinFromUrl(page.url()) ?? 'unknown'}`)

  const title = await extractTitle(page)
  const subtitle = await extractSubtitle(page)
  const { names: authors, amazonAuthorIds } = await extractAuthors(page)
  const { isbn10, isbn13 } = await extractIsbns(page)
  const asin = await extractAsin(page)
  const { publisher, publishedDate } = await extractPublisherInfo(page)
  const pageCount = await extractPageCount(page)
  const description = await extractDescription(page)
  const coverImageUrl = await extractCoverImage(page)
  const { seriesName, seriesUrl, seriesPosition } = await extractSeriesInfo(page)
  const { lexileScore, ageRange, gradeLevel } = await extractReadingLevel(page)
  const formats = await extractFormats(page)

  const bookData: BookData = {
    title,
    subtitle,
    authors,
    amazonAuthorIds,
    isbn10,
    isbn13,
    asin,
    publisher,
    publishedDate,
    pageCount,
    description,
    coverImageUrl,
    lexileScore,
    ageRange,
    gradeLevel,
    seriesName,
    seriesUrl,
    seriesPosition,
    formats,
  }

  console.log('✅ Parsed book data:', {
    title: bookData.title,
    authors: bookData.authors,
    amazonAuthorIds: bookData.amazonAuthorIds,
    seriesName: bookData.seriesName,
    formats: bookData.formats.map((f) => f.type),
  })

  return bookData
}

/**
 * Navigate to the preferred format if a better one is available.
 * Returns true if navigation happened, false if already on best format.
 */
export async function ensurePreferredFormat(page: Page): Promise<boolean> {
  const currentUrl = page.url()
  const currentAsin = extractAsinFromUrl(currentUrl)

  console.log('🔍 Checking for preferred format...')

  const formats = await extractFormats(page)
  if (formats.length === 0) {
    console.log('   No format options found, using current page')
    return false
  }

  // Sort by priority (highest first)
  formats.sort((a, b) => {
    const aPriority = FORMAT_PRIORITY[a.type] ?? 0
    const bPriority = FORMAT_PRIORITY[b.type] ?? 0
    return bPriority - aPriority
  })

  const bestFormat = formats[0]
  const bestPriority = FORMAT_PRIORITY[bestFormat.type] ?? 0
  const currentFormat = formats.find((f) => f.asin === currentAsin)
  const currentPriority = currentFormat ? (FORMAT_PRIORITY[currentFormat.type] ?? 0) : 0

  console.log(`   Current: ${currentFormat?.type ?? 'unknown'} (${currentAsin})`)
  console.log(`   Best available: ${bestFormat.type} (${bestFormat.asin})`)

  // Already on best format
  if (bestFormat.asin === currentAsin || bestPriority <= currentPriority) {
    console.log('   ✅ Already on preferred format')
    return false
  }

  // Navigate to better format
  console.log(`   🔄 Upgrading to ${bestFormat.type}...`)
  await page.goto(bestFormat.amazonUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  console.log(`   ✅ Navigated to ${bestFormat.type}`)
  return true
}

// --- Extraction helpers ---

async function extractTitle(page: Page): Promise<string | null> {
  try {
    const element = page.locator('#productTitle').first()
    const isVisible = await element.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
    if (!isVisible) return null

    const text = await element.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
    if (!text) return null

    // Remove series names in parentheses at the end
    const cleaned = text
      .trim()
      .replace(/\s*\([^)]+\)\s*$/, '') // Remove trailing parentheses (series names)
      .trim()

    return cleaned || null
  } catch {
    return null
  }
}

async function extractSubtitle(page: Page): Promise<string | null> {
  try {
    const element = page.locator('#productSubtitle').first()
    const isVisible = await element.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
    if (!isVisible) return null

    const text = await element.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
    return text?.trim() ?? null
  } catch {
    return null
  }
}

async function extractAuthors(page: Page): Promise<{ names: string[]; amazonAuthorIds: string[] }> {
  const names: string[] = []
  const amazonAuthorIds: string[] = []

  try {
    const contributorElements = await page.locator('#bylineInfo .author').all()

    for (const element of contributorElements) {
      const link = element.locator('a.a-link-normal').first()
      const isVisible = await link.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
      if (!isVisible) continue

      const name = await link.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      if (name) names.push(name.trim())

      // Extract Amazon author ID from href (e.g., /e/B000APEZHY or /author/B000APEZHY)
      const href = await link.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)
      if (href) {
        const match = href.match(/\/(?:e|author)\/([A-Z0-9]+)/)
        if (match && !amazonAuthorIds.includes(match[1])) {
          amazonAuthorIds.push(match[1])
        }
      }
    }
  } catch {
    try {
      const authorLink = page.locator('#bylineInfo a.a-link-normal').first()
      const isVisible = await authorLink.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
      if (isVisible) {
        const name = await authorLink.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
        if (name) names.push(name.trim())

        const href = await authorLink.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)
        if (href) {
          const match = href.match(/\/(?:e|author)\/([A-Z0-9]+)/)
          if (match) amazonAuthorIds.push(match[1])
        }
      }
    } catch {
      // No authors found
    }
  }

  if (amazonAuthorIds.length > 0) {
    console.log(`   📝 Extracted ${amazonAuthorIds.length} Amazon author IDs: ${amazonAuthorIds.join(', ')}`)
  }

  return { names, amazonAuthorIds }
}

async function extractIsbns(page: Page): Promise<{ isbn10: string | null; isbn13: string | null }> {
  const isbn10 = await extractDetailValue(page, 'ISBN-10')
  const isbn13 = await extractDetailValue(page, 'ISBN-13')

  return { isbn10, isbn13 }
}

async function extractAsin(page: Page): Promise<string | null> {
  const asin = await extractDetailValue(page, 'ASIN')
  if (asin) return asin

  try {
    const url = page.url()
    const match = url.match(/\/dp\/([A-Z0-9]{10})/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

async function extractPublisherInfo(page: Page): Promise<{ publisher: string | null; publishedDate: string | null }> {
  const publisherRaw = await extractDetailValue(page, 'Publisher')

  if (!publisherRaw) return { publisher: null, publishedDate: null }

  const dateMatch = publisherRaw.match(/\(([^)]+)\)$/)
  const publishedDate = dateMatch?.[1]?.trim() ?? null
  const publisher = publisherRaw.replace(/\s*\([^)]+\)$/, '').trim()

  return { publisher, publishedDate }
}

async function extractPageCount(page: Page): Promise<number | null> {
  const pagesRaw = await extractDetailValue(page, 'Print length')
  if (!pagesRaw) return null

  const match = pagesRaw.match(/(\d+)\s+pages/i)
  return match ? parseInt(match[1], 10) : null
}

async function extractDescription(page: Page): Promise<string | null> {
  try {
    const descElement = page.locator('#bookDescription_feature_div .a-expander-content').first()
    const descVisible = await descElement.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
    if (descVisible) {
      const text = await descElement.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      if (text) return text.trim().replace(/\s{2,}/g, ' ')
    }

    const altElement = page.locator('#productDescription p').first()
    const altVisible = await altElement.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
    if (altVisible) {
      const text = await altElement.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      return text?.trim().replace(/\s{2,}/g, ' ') ?? null
    }

    return null
  } catch {
    return null
  }
}

async function extractCoverImage(page: Page): Promise<string | null> {
  try {
    const imgElement = page.locator('#imgTagWrapperId img').first()
    const isVisible = await imgElement.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
    if (!isVisible) return null

    const dynamicImage = await imgElement.getAttribute('data-a-dynamic-image', { timeout: attributeTimeoutMs }).catch(() => null)

    if (dynamicImage) {
      const imageMap = JSON.parse(dynamicImage) as Record<string, unknown>
      const urls = Object.keys(imageMap)

      const largest = urls.sort((a, b) => {
        const aSize = extractImageSize(a)
        const bSize = extractImageSize(b)
        return bSize - aSize
      })[0]

      if (largest) return largest
    }

    const src = await imgElement.getAttribute('src', { timeout: attributeTimeoutMs }).catch(() => null)
    return src ?? null
  } catch {
    return null
  }
}

async function extractSeriesInfo(page: Page): Promise<{
  seriesName: string | null
  seriesUrl: string | null
  seriesPosition: number | null
}> {
  try {
    let seriesName: string | null = null
    let seriesUrl: string | null = null
    let seriesPosition: number | null = null

    // Primary: Try #seriesBulletWidget_feature_div which contains "Book X of Y: Series Name"
    // HTML: <a href="/dp/..."> Book 1 of 10: Narwhal and Jelly </a>
    const bulletWidgetLink = page.locator('#seriesBulletWidget_feature_div a').first()
    const bulletVisible = await bulletWidgetLink.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)

    if (bulletVisible) {
      const bulletText = await bulletWidgetLink.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      const bulletHref = await bulletWidgetLink.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)

      if (bulletText && bulletHref) {
        seriesUrl = bulletHref

        // Parse "Book X of Y: Series Name" format
        const bulletMatch = bulletText.match(/Book\s+(\d+)\s+of\s+\d+[:\s]*(.+)/i)
        if (bulletMatch) {
          seriesPosition = parseInt(bulletMatch[1], 10)
          seriesName = bulletMatch[2].trim()
        } else {
          // Fallback: just use the text as series name
          seriesName = bulletText.trim()
        }

        console.log('📚 Found series from bulletWidget:', { seriesName, seriesUrl, seriesPosition })
      }
    }

    // Fallback selectors if bulletWidget didn't work
    if (!seriesUrl) {
      const seriesSelectors = [
        '#seriesBullet a',
        'a[href*="/series/"]',
        '#booksTitle .a-link-normal[href*="/dp/"]',
        '.series-childAsin-widget a',
        '#kindle-meta-binding a[href*="/dp/"]',
      ]

      for (const selector of seriesSelectors) {
        const seriesLink = page.locator(selector).first()
        const isVisible = await seriesLink.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)

        if (isVisible) {
          const linkText = await seriesLink.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
          const linkHref = await seriesLink.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)

          if (linkText && linkHref) {
            seriesUrl = linkHref

            // Try to parse "Book X of Y: Series Name" format
            const linkMatch = linkText.match(/Book\s+(\d+)\s+of\s+\d+[:\s]*(.+)/i)
            if (linkMatch) {
              seriesPosition = parseInt(linkMatch[1], 10)
              seriesName = linkMatch[2].trim()
            } else {
              seriesName = linkText.trim()
            }

            console.log(`📚 Found series from selector ${selector}:`, { seriesName, seriesUrl, seriesPosition })
            break
          }
        }
      }
    }

    // Fallback: extract from page meta text if no URL found yet
    if (!seriesName) {
      try {
        // Use evaluate for fast multi-element text extraction
        const metaText = await page.evaluate(() => {
          const selectors = ['#title', '#productSubtitle', '#bylineInfo']
          return selectors
            .map((s) => document.querySelector(s)?.textContent ?? '')
            .join(' ')
        })

        const seriesMatch = metaText.match(/Book\s+(\d+)\s+of\s+\d+[:\s]+([^()\n]+)/i)
        if (seriesMatch) {
          seriesPosition = parseInt(seriesMatch[1], 10)
          seriesName = seriesMatch[2].trim()
        }
      } catch {
        // Fallback extraction failed, continue
      }
    }

    // Fallback: extract from title (e.g., "Title (Series Name #1)")
    if (!seriesName) {
      const titleElement = page.locator('#productTitle').first()
      const titleVisible = await titleElement.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
      if (titleVisible) {
        const title = await titleElement.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
        if (title) {
          const titleSeriesMatch = title.match(/\(([^)]+?)\s*[#,]?\s*(?:Book\s*)?(\d+)\)/)
          if (titleSeriesMatch) {
            seriesName = titleSeriesMatch[1].trim()
            seriesPosition = seriesPosition ?? parseInt(titleSeriesMatch[2], 10)
          }
        }
      }
    }

    // Extract position from various sources if still missing
    if (!seriesPosition && seriesName) {
      try {
        // Use evaluate for fast multi-element text extraction
        const combinedText = await page.evaluate(() => {
          const selectors = ['#seriesBulletWidget_feature_div', '#seriesBullet', '#title', '#booksTitle']
          return selectors
            .map((s) => document.querySelector(s)?.textContent ?? '')
            .join(' ')
        })
        const positionMatch = combinedText.match(/Book\s+(\d+)/i)
        seriesPosition = positionMatch ? parseInt(positionMatch[1], 10) : null
      } catch {
        // Position extraction is optional, don't fail the whole extraction
      }
    }

    // Normalize URL to absolute
    if (seriesUrl && !seriesUrl.startsWith('http')) {
      seriesUrl = `https://www.amazon.com${seriesUrl}`
    }

    return {
      seriesName: seriesName?.trim() ?? null,
      seriesUrl,
      seriesPosition,
    }
  } catch (error) {
    console.log('⚠️ Error extracting series info:', error instanceof Error ? error.message : 'Unknown')
    return { seriesName: null, seriesUrl: null, seriesPosition: null }
  }
}

async function extractReadingLevel(page: Page): Promise<{
  lexileScore: number | null
  ageRange: string | null
  gradeLevel: string | null
}> {
  const lexileRaw = await extractDetailValue(page, 'Lexile')
  const lexileMatch = lexileRaw?.match(/(\d+)L/i)
  const lexileScore = lexileMatch ? parseInt(lexileMatch[1], 10) : null

  const ageRange = await extractDetailValue(page, 'Reading age')
  const gradeLevel = await extractDetailValue(page, 'Grade level')

  return { lexileScore, ageRange, gradeLevel }
}

// --- Low-level helpers ---

async function extractDetailValue(page: Page, label: string): Promise<string | null> {
  try {
    // Use page.evaluate for fast extraction without timeouts
    const value = await page.evaluate((searchLabel) => {
      const items = document.querySelectorAll('#detailBullets_feature_div li .a-list-item')
      for (const item of items) {
        if (item.textContent?.includes(searchLabel)) {
          const spans = item.querySelectorAll('span')
          const lastSpan = spans[spans.length - 1]
          return lastSpan?.textContent?.trim() ?? null
        }
      }
      return null
    }, label)
    return value
  } catch {
    return null
  }
}

function extractImageSize(url: string): number {
  const match = url.match(/_S[XLY](\d+)_/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Extract available formats from the "See all formats" section.
 * Returns an array of formats with their ASINs and URLs.
 */
async function extractFormats(page: Page): Promise<BookFormat[]> {
  const seenAsins = new Set<string>()

  try {
    // Use page.evaluate for fast extraction without individual timeouts
    const rawFormats = await page.evaluate(() => {
      const results: Array<{ href: string; text: string }> = []
      const selectors = [
        '#tmmSwatches a.a-button-text',
        '#tmmSwatches span.a-button a',
        '#mediaTab_content_landing a',
        '.swatchElement a',
      ]

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector)
        for (const el of elements) {
          const href = el.getAttribute('href')
          const text = el.textContent
          if (href && text) {
            results.push({ href, text })
          }
        }
        if (results.length > 0) break
      }

      return results
    })

    const formats: BookFormat[] = []

    for (const { href, text } of rawFormats) {
      const asin = extractAsinFromUrl(href)
      if (!asin || seenAsins.has(asin)) continue
      seenAsins.add(asin)

      const formatType = detectFormatType(text)
      const amazonUrl = href.startsWith('http')
        ? href
        : `https://www.amazon.com${href}`

      formats.push({
        type: formatType,
        asin,
        amazonUrl: normalizeAmazonUrl(amazonUrl),
      })
    }

    // Also add current page as a format if not already present
    const currentUrl = page.url()
    const currentAsin = extractAsinFromUrl(currentUrl)
    if (currentAsin && !seenAsins.has(currentAsin)) {
      const currentFormat = await detectCurrentFormat(page)
      formats.push({
        type: currentFormat,
        asin: currentAsin,
        amazonUrl: normalizeAmazonUrl(currentUrl),
      })
    }

    if (formats.length > 0) {
      console.log(`   📚 Found ${formats.length} formats: ${formats.map((f) => f.type).join(', ')}`)
    }

    return formats
  } catch (error) {
    console.log('⚠️ Error extracting formats:', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

function detectFormatType(text: string): string {
  const lower = text.toLowerCase()

  if (lower.includes('hardcover')) return 'hardcover'
  if (lower.includes('paperback') || lower.includes('mass market')) return 'paperback'
  if (lower.includes('kindle') || lower.includes('ebook')) return 'kindle'
  if (lower.includes('audiobook') || lower.includes('audible')) return 'audiobook'
  if (lower.includes('board book')) return 'board_book'
  if (lower.includes('spiral')) return 'spiral'
  if (lower.includes('library binding')) return 'library_binding'

  return 'unknown'
}

async function detectCurrentFormat(page: Page): Promise<string> {
  try {
    // Use page.evaluate for fast extraction
    const formatInfo = await page.evaluate(() => {
      const selected = document.querySelector('#tmmSwatches .a-button-selected')?.textContent
      const subtitle = document.querySelector('#productSubtitle')?.textContent
      const binding = document.querySelector('#detailBullets_feature_div')?.textContent
      return { selected, subtitle, binding }
    })

    if (formatInfo.selected) return detectFormatType(formatInfo.selected)
    if (formatInfo.subtitle) return detectFormatType(formatInfo.subtitle)
    if (formatInfo.binding) {
      if (formatInfo.binding.toLowerCase().includes('hardcover')) return 'hardcover'
      if (formatInfo.binding.toLowerCase().includes('paperback')) return 'paperback'
    }
  } catch {
    // Ignore detection failures
  }

  return 'unknown'
}
