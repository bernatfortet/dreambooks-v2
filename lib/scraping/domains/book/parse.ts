import type { Page } from 'playwright'
import { BookData, BookFormat, FORMAT_PRIORITY, COVER_FORMAT_PRIORITY, Contributor, ContributorRole, EditionData } from './types'
import { extractAsinFromUrl, normalizeAmazonUrl } from '@/lib/scraping/utils/amazon-url'
import { dumpPageHtml } from '@/lib/scraping/utils/html-dump'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'
import { parseAgeRange } from '@/lib/utils/age-range'
import { parseGradeLevel } from '@/lib/utils/grade-level'

const { visibilityTimeoutMs, textContentTimeoutMs, attributeTimeoutMs } = SCRAPING_CONFIG.extraction

/**
 * Options for parsing a book page.
 */
export type ParseBookOptions = {
  /** Scrape each edition page to extract per-edition ISBNs and covers (default: false) */
  scrapeEditions?: boolean
  /** Maximum number of edition pages to scrape (default: 4) */
  maxEditions?: number
}

/**
 * Parse book data from an Amazon product page using Playwright.
 * Extracts title, authors, ISBNs, series info, formats, etc.
 *
 * @param page - Playwright page object
 * @param options - Parsing options (e.g., whether to scrape edition pages)
 */
export async function parseBookFromPage(page: Page, options: ParseBookOptions = {}): Promise<BookData> {
  const { scrapeEditions = false, maxEditions = 4 } = options

  console.log('🌀 Parsing Amazon book page...', { scrapeEditions, maxEditions })

  // Dump HTML for debugging
  await dumpPageHtml(page, `book_${extractAsinFromUrl(page.url()) ?? 'unknown'}`)

  const title = await extractTitle(page)
  const { names: authors, amazonAuthorIds, contributors } = await extractAuthors(page)
  const { isbn10, isbn13 } = await extractIsbns(page)
  const { publisher, publishedDate } = await extractPublisherInfo(page)
  const pageCount = await extractPageCount(page)
  const description = await extractDescription(page)
  const formats = await extractFormats(page)
  const currentFormat = await detectCurrentFormat(page)
  const initialCover = await extractCoverImageWithDimensions(page)
  let coverImageUrl = initialCover.url
  let coverWidth = initialCover.width
  let coverHeight = initialCover.height
  let coverSourceFormat: string | null = currentFormat
  let coverSourceAsin: string | null = extractAsinFromUrl(page.url())

  // Determine canonical ASIN: prefer hardcover from formats list, fallback to current page
  // This ensures canonical ASIN is always hardcover (if available) regardless of starting page
  // No need to navigate back to hardcover - we can use its ASIN from the formats list
  const canonicalFormat =
    formats.find((f) => f.type === 'hardcover') ??
    [...formats].sort((a, b) => {
      const aPriority = FORMAT_PRIORITY[a.type] ?? 0
      const bPriority = FORMAT_PRIORITY[b.type] ?? 0
      return bPriority - aPriority
    })[0]
  const asin = canonicalFormat?.asin ?? (await extractAsin(page))

  // Scrape edition pages if requested (before navigating for cover)
  let editions: EditionData[] = []
  if (scrapeEditions && formats.length > 0) {
    editions = await scrapeEditionPages(page, formats, maxEditions)
  }

  // Try to get a better cover from Kindle edition (best-effort, fail-open)
  // Skip if we already scraped editions (we have cover URLs from there)
  if (!scrapeEditions) {
    const betterCover = await selectBestCoverSource(page, formats, currentFormat)
    if (betterCover) {
      coverImageUrl = betterCover.coverImageUrl
      coverWidth = betterCover.coverWidth
      coverHeight = betterCover.coverHeight
      coverSourceFormat = betterCover.coverSourceFormat
      coverSourceAsin = betterCover.coverSourceAsin
    }
  } else if (editions.length > 0) {
    // If we scraped editions, pick the best cover from them
    const bestEditionCover = pickBestEditionCover(editions)
    if (bestEditionCover) {
      coverImageUrl = bestEditionCover.mainCoverUrl
      coverWidth = bestEditionCover.coverWidth
      coverHeight = bestEditionCover.coverHeight
      coverSourceFormat = bestEditionCover.format
      coverSourceAsin = bestEditionCover.asin
    }
  }

  const { seriesName, seriesUrl, seriesPosition } = await extractSeriesInfo(page)
  const { lexileScore, ageRangeRaw, gradeLevelRaw } = await extractReadingLevel(page)

  // Parse age range into numeric values for filtering
  const parsedAgeRange = parseAgeRange(ageRangeRaw)
  // Parse grade level into numeric values for filtering
  const parsedGradeLevel = parseGradeLevel(gradeLevelRaw)

  const bookData: BookData = {
    title,
    authors,
    amazonAuthorIds,
    contributors,
    isbn10,
    isbn13,
    asin,
    publisher,
    publishedDate,
    pageCount,
    description,
    coverImageUrl,
    coverWidth,
    coverHeight,
    coverSourceFormat,
    coverSourceAsin,
    lexileScore,
    ageRangeMin: parsedAgeRange?.min ?? null,
    ageRangeMax: parsedAgeRange?.max ?? null,
    ageRangeRaw,
    gradeLevelMin: parsedGradeLevel?.min ?? null,
    gradeLevelMax: parsedGradeLevel?.max ?? null,
    gradeLevelRaw,
    seriesName,
    seriesUrl,
    seriesPosition,
    formats,
    editions,
  }

  console.log('✅ Parsed book data:', {
    title: bookData.title,
    contributors: bookData.contributors.map((c) => `${c.name} (${c.role})`),
    seriesName: bookData.seriesName,
    formats: bookData.formats.map((f) => f.type),
    editions: bookData.editions.length,
    coverSourceFormat: bookData.coverSourceFormat,
  })

  return bookData
}

/**
 * Pick the best cover from scraped editions based on cover format priority.
 */
function pickBestEditionCover(editions: EditionData[]): EditionData | null {
  const editionsWithCovers = editions.filter((e) => e.mainCoverUrl)
  if (editionsWithCovers.length === 0) return null

  // Sort by cover format priority
  editionsWithCovers.sort((a, b) => {
    const aPriority = COVER_FORMAT_PRIORITY[a.format] ?? 0
    const bPriority = COVER_FORMAT_PRIORITY[b.format] ?? 0
    return bPriority - aPriority
  })

  return editionsWithCovers[0]
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

/**
 * Parse role text like "(Author)" or "(Illustrator)" into normalized ContributorRole.
 */
function parseRole(roleText: string | null): ContributorRole {
  if (!roleText) return 'author' // Default to author if no role specified

  const normalized = roleText.toLowerCase().trim().replace(/[(),]/g, '')

  if (normalized.includes('author')) return 'author'
  if (normalized.includes('illustrator')) return 'illustrator'
  if (normalized.includes('editor')) return 'editor'
  if (normalized.includes('translator')) return 'translator'
  if (normalized.includes('narrator')) return 'narrator'

  return 'other'
}

async function extractAuthors(page: Page): Promise<{ names: string[]; amazonAuthorIds: string[]; contributors: Contributor[] }> {
  const names: string[] = []
  const amazonAuthorIds: string[] = []
  const contributors: Contributor[] = []

  try {
    const contributorElements = await page.locator('#bylineInfo .author').all()

    for (const element of contributorElements) {
      const link = element.locator('a.a-link-normal').first()
      const isVisible = await link.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
      if (!isVisible) continue

      const name = await link.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      if (!name) continue

      const trimmedName = name.trim()
      names.push(trimmedName)

      // Extract Amazon author ID from href (e.g., /e/B000APEZHY or /author/B000APEZHY)
      let amazonAuthorId: string | null = null
      const href = await link.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)
      if (href) {
        const match = href.match(/\/(?:e|author)\/([A-Z0-9]+)/)
        if (match) {
          amazonAuthorId = match[1]
          if (!amazonAuthorIds.includes(amazonAuthorId)) {
            amazonAuthorIds.push(amazonAuthorId)
          }
        }
      }

      // Extract role from .contribution .a-color-secondary
      let role: ContributorRole = 'author' // Default to author
      try {
        const contributionSpan = element.locator('.contribution .a-color-secondary').first()
        const isContributionVisible = await contributionSpan.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
        if (isContributionVisible) {
          const roleText = await contributionSpan.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
          role = parseRole(roleText)
        }
      } catch {
        // Role extraction failed, use default
      }

      contributors.push({
        name: trimmedName,
        amazonAuthorId,
        role,
      })
    }
  } catch {
    try {
      const authorLink = page.locator('#bylineInfo a.a-link-normal').first()
      const isVisible = await authorLink.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
      if (isVisible) {
        const name = await authorLink.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
        if (name) {
          const trimmedName = name.trim()
          names.push(trimmedName)

          const href = await authorLink.getAttribute('href', { timeout: attributeTimeoutMs }).catch(() => null)
          let amazonAuthorId: string | null = null
          if (href) {
            const match = href.match(/\/(?:e|author)\/([A-Z0-9]+)/)
            if (match) {
              amazonAuthorId = match[1]
              amazonAuthorIds.push(amazonAuthorId)
            }
          }

          contributors.push({
            name: trimmedName,
            amazonAuthorId,
            role: 'author', // Default when using fallback extraction
          })
        }
      }
    } catch {
      // No authors found
    }
  }

  if (amazonAuthorIds.length > 0) {
    console.log(`   📝 Extracted ${amazonAuthorIds.length} Amazon author IDs: ${amazonAuthorIds.join(', ')}`)
  }

  if (contributors.length > 0) {
    const rolesSummary = contributors.map((c) => `${c.name} (${c.role})`).join(', ')
    console.log(`   👥 Extracted ${contributors.length} contributors: ${rolesSummary}`)
  }

  return { names, amazonAuthorIds, contributors }
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

  // Try to get publication date from dedicated field first (newer Amazon format)
  let publishedDate = await extractDetailValue(page, 'Publication date')

  // Fallback: extract date from parentheses in Publisher field (older format: "Publisher (Date)")
  if (!publishedDate && publisherRaw) {
    const dateMatch = publisherRaw.match(/\(([^)]+)\)$/)
    publishedDate = dateMatch?.[1]?.trim() ?? null
  }

  // Clean publisher name (remove date in parentheses if present)
  const publisher = publisherRaw?.replace(/\s*\([^)]+\)$/, '').trim() ?? null

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

/**
 * Extract cover image URL with dimensions from data-a-dynamic-image.
 * Returns the largest image with its width and height.
 */
async function extractCoverImageWithDimensions(page: Page): Promise<{
  url: string | null
  width: number | null
  height: number | null
}> {
  try {
    const imgElement = page.locator('#imgTagWrapperId img').first()
    const isVisible = await imgElement.isVisible({ timeout: visibilityTimeoutMs }).catch(() => false)
    if (!isVisible) return { url: null, width: null, height: null }

    const dynamicImage = await imgElement.getAttribute('data-a-dynamic-image', { timeout: attributeTimeoutMs }).catch(() => null)

    if (dynamicImage) {
      const imageMap = JSON.parse(dynamicImage) as Record<string, [number, number]>
      const entries = Object.entries(imageMap)

      if (entries.length > 0) {
        // Sort by total pixels (width * height), descending
        entries.sort((a, b) => {
          const aPixels = a[1][0] * a[1][1]
          const bPixels = b[1][0] * b[1][1]
          return bPixels - aPixels
        })

        const [url, [width, height]] = entries[0]
        return { url, width, height }
      }
    }

    // Fallback to src attribute
    const src = await imgElement.getAttribute('src', { timeout: attributeTimeoutMs }).catch(() => null)
    return { url: src, width: null, height: null }
  } catch {
    return { url: null, width: null, height: null }
  }
}

/**
 * Scrape edition pages to extract per-edition identifiers and cover URLs.
 * Visits up to 4 format pages (hardcover, paperback, kindle, audiobook).
 *
 * @param page - Playwright page object
 * @param formats - List of formats extracted from the main page
 * @param maxEditions - Maximum number of edition pages to visit (default 4)
 * @returns Array of EditionData for each visited edition
 */
export async function scrapeEditionPages(page: Page, formats: BookFormat[], maxEditions: number = 4): Promise<EditionData[]> {
  const editions: EditionData[] = []
  const startUrl = page.url()

  // Sort formats by priority to visit most important first
  const sortedFormats = [...formats].sort((a, b) => {
    const aPriority = FORMAT_PRIORITY[a.type] ?? 0
    const bPriority = FORMAT_PRIORITY[b.type] ?? 0
    return bPriority - aPriority
  })

  // Limit to maxEditions
  const formatsToVisit = sortedFormats.slice(0, maxEditions)

  console.log(`📖 Scraping ${formatsToVisit.length} edition pages...`)

  for (const format of formatsToVisit) {
    try {
      // Check if we're already on this page
      const currentAsin = extractAsinFromUrl(page.url())
      if (currentAsin !== format.asin) {
        console.log(`   🔄 Navigating to ${format.type} edition (${format.asin})...`)
        await page.goto(format.amazonUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
        await page.waitForTimeout(1000) // Brief wait for dynamic content
      }

      // Extract identifiers
      const { isbn10, isbn13 } = await extractIsbns(page)

      // Extract cover with dimensions
      const coverData = await extractCoverImageWithDimensions(page)

      const editionData: EditionData = {
        format: format.type,
        asin: format.asin,
        amazonUrl: format.amazonUrl,
        isbn10,
        isbn13,
        mainCoverUrl: coverData.url,
        coverWidth: coverData.width,
        coverHeight: coverData.height,
      }

      editions.push(editionData)

      console.log(`   ✅ ${format.type}: ISBN-10=${isbn10 ?? 'none'}, ISBN-13=${isbn13 ?? 'none'}, cover=${coverData.url ? 'yes' : 'none'}`)
    } catch (error) {
      console.log(`   ⚠️ Failed to scrape ${format.type} edition:`, error instanceof Error ? error.message : 'Unknown')

      // Still add the edition with what we have
      editions.push({
        format: format.type,
        asin: format.asin,
        amazonUrl: format.amazonUrl,
        isbn10: null,
        isbn13: null,
        mainCoverUrl: null,
        coverWidth: null,
        coverHeight: null,
      })
    }
  }

  // Navigate back to original page if we moved
  const endAsin = extractAsinFromUrl(page.url())
  const startAsin = extractAsinFromUrl(startUrl)
  if (endAsin !== startAsin) {
    console.log(`   🔙 Returning to original page...`)
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  }

  console.log(`📖 Scraped ${editions.length} editions`)

  return editions
}

export async function extractSeriesInfo(page: Page): Promise<{
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
          return selectors.map((s) => document.querySelector(s)?.textContent ?? '').join(' ')
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
          return selectors.map((s) => document.querySelector(s)?.textContent ?? '').join(' ')
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
  ageRangeRaw: string | null
  gradeLevelRaw: string | null
}> {
  const lexileRaw = await extractDetailValue(page, 'Lexile')
  const lexileMatch = lexileRaw?.match(/(\d+)L/i)
  const lexileScore = lexileMatch ? parseInt(lexileMatch[1], 10) : null

  const ageRangeRaw = await extractDetailValue(page, 'Reading age')
  const gradeLevelRaw = await extractDetailValue(page, 'Grade level')

  return { lexileScore, ageRangeRaw, gradeLevelRaw }
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
      const selectors = ['#tmmSwatches a.a-button-text', '#tmmSwatches span.a-button a', '#mediaTab_content_landing a', '.swatchElement a']

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
      const amazonUrl = href.startsWith('http') ? href : `https://www.amazon.com${href}`

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

/**
 * Select the best cover source from available formats.
 * Navigates to the preferred format (Kindle > paperback > hardcover) and extracts cover.
 *
 * FAIL-OPEN: If navigation or extraction fails, returns null (caller keeps current cover).
 * This function should NEVER throw or fail the overall book scrape.
 */
async function selectBestCoverSource(
  page: Page,
  formats: BookFormat[],
  currentFormat: string | null,
): Promise<{
  coverImageUrl: string
  coverWidth: number | null
  coverHeight: number | null
  coverSourceFormat: string
  coverSourceAsin: string
} | null> {
  try {
    if (formats.length === 0) {
      return null
    }

    // Sort formats by cover priority (descending)
    const sortedFormats = [...formats].sort((a, b) => {
      const aPriority = COVER_FORMAT_PRIORITY[a.type] ?? 0
      const bPriority = COVER_FORMAT_PRIORITY[b.type] ?? 0
      return bPriority - aPriority
    })

    const bestFormat = sortedFormats[0]
    const bestPriority = COVER_FORMAT_PRIORITY[bestFormat.type] ?? 0
    const currentPriority = currentFormat ? (COVER_FORMAT_PRIORITY[currentFormat] ?? 0) : 0

    // Only navigate if we have a better format available
    if (bestPriority <= currentPriority) {
      return null
    }

    console.log(`   🎨 Trying to get better cover from ${bestFormat.type}...`)
    await page.goto(bestFormat.amazonUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(1500)

    // Extract cover from the new page
    const coverData = await extractCoverImageWithDimensions(page)

    if (!coverData.url) {
      console.log(`   ⚠️ Failed to extract cover from ${bestFormat.type}, keeping current cover`)
      return null
    }

    console.log(`   ✅ Got cover from ${bestFormat.type}`)
    return {
      coverImageUrl: coverData.url,
      coverWidth: coverData.width,
      coverHeight: coverData.height,
      coverSourceFormat: bestFormat.type,
      coverSourceAsin: bestFormat.asin,
    }
  } catch (error) {
    console.log(`   ⚠️ Cover source selection failed:`, error instanceof Error ? error.message : 'Unknown error')
    return null
  }
}
