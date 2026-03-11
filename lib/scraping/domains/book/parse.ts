import type { Page } from 'playwright'
import { BookData, BookFormat, FORMAT_PRIORITY, COVER_FORMAT_PRIORITY, Contributor, ContributorRole, EditionData } from './types'
import { pickBestEditionCover } from './preferred-cover'
import { extractAsinFromUrl, normalizeAmazonUrl } from '@/lib/scraping/utils/amazon-url'
import { dumpPageHtml } from '@/lib/scraping/utils/html-dump'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'
import { parseAgeRange } from '@/lib/utils/age-range'
import { parseGradeLevel } from '@/lib/utils/grade-level'
import { computeRatingScore } from './rating-score'

const { visibilityTimeoutMs, textContentTimeoutMs, attributeTimeoutMs } = SCRAPING_CONFIG.extraction
const { formatSwitch } = SCRAPING_CONFIG.delays

/**
 * Generate a random delay in milliseconds within the given range.
 * Adds irregularity to scraping timing for more human-like behavior.
 */
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function waitAfterFormatSwitch(page: Page): Promise<void> {
  await page
    .locator('#detailBullets_feature_div li .a-list-item')
    .first()
    .waitFor({ state: 'attached', timeout: 2500 })
    .catch(() => {})

  await page
    .locator('#imgTagWrapperId img')
    .waitFor({ state: 'visible', timeout: 2000 })
    .catch(() => {})
  await page.waitForTimeout(randomDelay(formatSwitch.min, formatSwitch.max))
}

/**
 * Options for parsing a book page.
 */
export type ParseBookOptions = {
  /** Scrape each edition page to extract per-edition ISBNs and covers (default: false) */
  scrapeEditions?: boolean
  /** Maximum number of edition pages to scrape (default: all) */
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
  const { scrapeEditions = false, maxEditions = Number.POSITIVE_INFINITY } = options

  console.log('🌀 Parsing Amazon book page...', { scrapeEditions, maxEditions })

  // Dump HTML for debugging
  await dumpPageHtml(page, `book_${extractAsinFromUrl(page.url()) ?? 'unknown'}`)

  // Extract fields that should not depend on edition navigation.

  const title = await extractTitle(page)
  const subtitle = null
  const { names: authors, amazonAuthorIds, contributors } = await extractAuthors(page)
  const { isbn10, isbn13 } = await extractIsbns(page)
  const { publisher, publishedDate } = await extractPublisherInfo(page)
  const language = await extractLanguage(page)
  const pageCount = await extractPageCount(page)
  const description = await extractDescription(page)
  const formats = await extractFormats(page)
  const currentFormat = await detectCurrentFormat(page)
  const initialCover = await extractCoverImageWithDimensions(page)

  // These can be affected by changing editions, so extract them now.
  const { seriesName, seriesUrl, seriesPosition } = await extractSeriesInfo(page)
  const { lexileScore, ageRangeRaw, gradeLevelRaw } = await extractReadingLevel(page)
  const { amazonRatingAverage, amazonRatingCount, goodreadsRatingAverage, goodreadsRatingCount } = await extractRatings(page)
  const categories = await extractCategories(page)

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

  // After this point, the page URL may change (edition navigation / cover selection).

  // Scrape edition pages if requested
  let editions: EditionData[] = []
  if (scrapeEditions && formats.length > 0) {
    editions = await scrapeEditionPages(page, formats, maxEditions)
  }

  // Try to get a better cover from the best available non-audiobook edition (best-effort, fail-open)
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
    const bestEditionCover = pickBestEditionCover(editions)
    if (bestEditionCover) {
      coverImageUrl = bestEditionCover.mainCoverUrl
      coverWidth = bestEditionCover.coverWidth
      coverHeight = bestEditionCover.coverHeight
      coverSourceFormat = bestEditionCover.format
      coverSourceAsin = bestEditionCover.asin
    }
  }

  // Parse age range into numeric values for filtering
  const parsedAgeRange = parseAgeRange(ageRangeRaw)
  // Parse grade level into numeric values for filtering
  const parsedGradeLevel = parseGradeLevel(gradeLevelRaw)
  // Compute rating score from both sources
  const ratingScore = computeRatingScore({
    amazonAverage: amazonRatingAverage,
    amazonCount: amazonRatingCount,
    goodreadsAverage: goodreadsRatingAverage,
    goodreadsCount: goodreadsRatingCount,
  })

  const bookData: BookData = {
    title,
    subtitle,
    authors,
    amazonAuthorIds,
    contributors,
    isbn10,
    isbn13,
    asin,
    publisher,
    publishedDate,
    language,
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
    amazonRatingAverage,
    amazonRatingCount,
    goodreadsRatingAverage,
    goodreadsRatingCount,
    ratingScore,
    seriesName,
    seriesUrl,
    seriesPosition,
    formats,
    editions,
    categories,
  }

  console.log('✅ Parsed book data:', {
    title: bookData.title,
    contributors: bookData.contributors.map((c) => `${c.name} (${c.role})`),
    seriesName: bookData.seriesName,
    language: bookData.language,
    formats: bookData.formats.map((f) => f.type),
    editions: bookData.editions.length,
    coverSourceFormat: bookData.coverSourceFormat,
    categories: bookData.categories.length > 0 ? bookData.categories.join(' > ') : 'none',
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
  await waitAfterFormatSwitch(page)

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
      .replace(/:\s*$/, '')
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

function extractAmazonAuthorIdFromHref(href: string): string | null {
  try {
    const url = href.startsWith('http') ? new URL(href) : new URL(href, 'https://www.amazon.com')
    const path = url.pathname

    // Common patterns:
    // - /e/B000APEZHY
    // - /author/B000APEZHY
    // - /Some-Name/e/B000APEZHY
    // - /-/e/B000APEZHY
    const eMatch = path.match(/\/e\/([A-Z0-9]+)/i)
    if (eMatch?.[1]) return eMatch[1].toUpperCase()

    const authorMatch = path.match(/\/author\/([A-Z0-9]+)/i)
    if (authorMatch?.[1]) return authorMatch[1].toUpperCase()

    return null
  } catch {
    return null
  }
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
        amazonAuthorId = extractAmazonAuthorIdFromHref(href)
        if (amazonAuthorId && !amazonAuthorIds.includes(amazonAuthorId)) {
          amazonAuthorIds.push(amazonAuthorId)
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
            amazonAuthorId = extractAmazonAuthorIdFromHref(href)
            if (amazonAuthorId) amazonAuthorIds.push(amazonAuthorId)
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

async function extractLanguage(page: Page): Promise<string | null> {
  const language = await extractDetailValue(page, 'Language')
  return language?.trim() ?? null
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
 * Extracts current page first (no navigation), then visits remaining editions.
 *
 * @param page - Playwright page object
 * @param formats - List of formats extracted from the main page
 * @param maxEditions - Maximum number of edition pages to visit (default: all)
 * @returns Array of EditionData for each visited edition
 */
export async function scrapeEditionPages(
  page: Page,
  formats: BookFormat[],
  maxEditions: number = Number.POSITIVE_INFINITY,
): Promise<EditionData[]> {
  const editions: EditionData[] = []
  const startUrl = normalizeAmazonUrl(page.url())
  const startAsin = extractAsinFromUrl(startUrl)

  // Sort formats by priority (hardcover > paperback > kindle > audiobook)
  const sortedFormats = [...formats].sort((a, b) => {
    const aPriority = FORMAT_PRIORITY[a.type] ?? 0
    const bPriority = FORMAT_PRIORITY[b.type] ?? 0
    return bPriority - aPriority
  })

  const editionsLimit = Number.isFinite(maxEditions) ? Math.max(0, Math.floor(maxEditions)) : sortedFormats.length
  const formatsToVisit = sortedFormats.slice(0, editionsLimit)

  // Find the current page's format (if it's in our list)
  const startFormat = startAsin ? formatsToVisit.find((f) => f.asin === startAsin) : null

  console.log(`📖 Scraping ${formatsToVisit.length} edition pages...`)

  // Extract current page first (no navigation needed)
  if (startFormat) {
    const editionData = await extractEditionFromCurrentPage(page, startFormat)
    editions.push(editionData)
    console.log(
      `   ✅ ${startFormat.type} (current): ISBN-10=${editionData.isbn10 ?? 'none'}, ISBN-13=${editionData.isbn13 ?? 'none'}, cover=${editionData.mainCoverUrl ? 'yes' : 'none'}`,
    )
  }

  // Visit remaining editions
  for (const format of formatsToVisit) {
    if (startAsin && format.asin === startAsin) continue // Already extracted

    if (!startAsin && format.amazonUrl === startUrl) {
      const editionData = await extractEditionFromCurrentPage(page, format)
      editions.push(editionData)
      console.log(
        `   ✅ ${format.type} (current): ISBN-10=${editionData.isbn10 ?? 'none'}, ISBN-13=${editionData.isbn13 ?? 'none'}, cover=${editionData.mainCoverUrl ? 'yes' : 'none'}`,
      )
      continue
    }

    try {
      console.log(`   🔄 Navigating to ${format.type} edition (${format.asin})...`)
      await page.goto(format.amazonUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await waitAfterFormatSwitch(page)

      const editionData = await extractEditionFromCurrentPage(page, format)
      editions.push(editionData)

      console.log(
        `   ✅ ${format.type}: ISBN-10=${editionData.isbn10 ?? 'none'}, ISBN-13=${editionData.isbn13 ?? 'none'}, cover=${editionData.mainCoverUrl ? 'yes' : 'none'}`,
      )
    } catch (error) {
      console.log(`   ⚠️ Failed to scrape ${format.type} edition:`, error instanceof Error ? error.message : 'Unknown')

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

  console.log(`📖 Scraped ${editions.length} editions`)

  return editions
}

async function extractEditionFromCurrentPage(page: Page, format: BookFormat): Promise<EditionData> {
  const { isbn10, isbn13 } = await extractIsbns(page)
  const coverData = await extractCoverImageWithDimensions(page)

  return {
    format: format.type,
    asin: format.asin,
    amazonUrl: format.amazonUrl,
    isbn10,
    isbn13,
    mainCoverUrl: coverData.url,
    coverWidth: coverData.width,
    coverHeight: coverData.height,
  }
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
        const extractedSeries = extractValidSeriesLinkData(bulletText)
        if (extractedSeries) {
          seriesUrl = bulletHref
          seriesName = extractedSeries.seriesName
          seriesPosition = extractedSeries.seriesPosition
          console.log('📚 Found series from bulletWidget:', { seriesName, seriesUrl, seriesPosition })
        }
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
            const extractedSeries = extractValidSeriesLinkData(linkText)
            if (!extractedSeries) continue

            seriesUrl = linkHref
            seriesName = extractedSeries.seriesName
            seriesPosition = extractedSeries.seriesPosition

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

    // Normalize URL to absolute and strip query params for consistent deduplication
    if (seriesUrl && !seriesUrl.startsWith('http')) {
      seriesUrl = `https://www.amazon.com${seriesUrl}`
    }
    if (seriesUrl) {
      seriesUrl = normalizeAmazonUrl(seriesUrl)
    }

    return {
      seriesName: normalizeSeriesLinkName(seriesName ?? '') ?? null,
      seriesUrl,
      seriesPosition,
    }
  } catch (error) {
    console.log('⚠️ Error extracting series info:', error instanceof Error ? error.message : 'Unknown')
    return { seriesName: null, seriesUrl: null, seriesPosition: null }
  }
}

const INVALID_SERIES_NAME_PATTERNS = [
  /\bkindle edition\b/i,
  /\bpaperback\b/i,
  /\bhardcover\b/i,
  /\baudiobook\b/i,
  /\baudible\b/i,
  /\bfollow the author\b/i,
  /\bcontinue shopping\b/i,
]

function extractValidSeriesLinkData(linkText: string): { seriesName: string; seriesPosition: number | null } | null {
  const trimmedText = linkText.trim()
  if (!trimmedText) return null

  const bookMatch = trimmedText.match(/Book\s+(\d+)\s+of\s+\d+[:\s]*(.+)/i)
  if (bookMatch) {
    const seriesName = normalizeSeriesLinkName(bookMatch[2])
    if (!seriesName) return null

    return {
      seriesName,
      seriesPosition: parseInt(bookMatch[1], 10),
    }
  }

  const seriesName = normalizeSeriesLinkName(trimmedText)
  if (!seriesName) return null

  return {
    seriesName,
    seriesPosition: null,
  }
}

function normalizeSeriesLinkName(rawName: string): string | null {
  const cleanedName = rawName
    .replace(/^Part of:\s*/i, '')
    .replace(/\(\d+\s*books?\s*(?:series)?\)/i, '')
    .replace(/Kindle Edition/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleanedName.length < 3) return null
  if (/^\d+$/.test(cleanedName)) return null
  if (INVALID_SERIES_NAME_PATTERNS.some((pattern) => pattern.test(cleanedName))) return null

  return cleanedName
}

/**
 * Extract Amazon category breadcrumbs from the page.
 * Returns array like ["Books", "Children's Books", "Animals", "Cats"]
 */
async function extractCategories(page: Page): Promise<string[]> {
  try {
    const categories = await page.evaluate(() => {
      const breadcrumbs: string[] = []

      // Primary: #wayfinding-breadcrumbs_feature_div
      const wayfinding = document.querySelector('#wayfinding-breadcrumbs_feature_div')
      if (wayfinding) {
        const links = wayfinding.querySelectorAll('a')
        for (const link of links) {
          const text = link.textContent?.trim()
          if (text && !breadcrumbs.includes(text)) {
            breadcrumbs.push(text)
          }
        }
      }

      // Fallback: #nav-subnav breadcrumbs
      if (breadcrumbs.length === 0) {
        const navSubnav = document.querySelector('#nav-subnav')
        if (navSubnav) {
          const links = navSubnav.querySelectorAll('a')
          for (const link of links) {
            const text = link.textContent?.trim()
            if (text && !breadcrumbs.includes(text)) {
              breadcrumbs.push(text)
            }
          }
        }
      }

      return breadcrumbs
    })

    if (categories.length > 0) {
      console.log(`   📂 Extracted categories: ${categories.join(' > ')}`)
    }

    return categories
  } catch (error) {
    console.log('⚠️ Error extracting categories:', error instanceof Error ? error.message : 'Unknown')
    return []
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

async function extractRatings(page: Page): Promise<{
  amazonRatingAverage: number | null
  amazonRatingCount: number | null
  goodreadsRatingAverage: number | null
  goodreadsRatingCount: number | null
}> {
  let amazonRatingAverage: number | null = null
  let amazonRatingCount: number | null = null
  let goodreadsRatingAverage: number | null = null
  let goodreadsRatingCount: number | null = null

  // Extract Amazon ratings
  try {
    // Try to get rating from #acrPopover title attribute (more reliable than visibility check)
    const acrPopover = page.locator('#acrPopover').first()
    const exists = (await acrPopover.count().catch(() => 0)) > 0

    if (exists) {
      // Try title attribute first (most reliable)
      const title = await acrPopover.getAttribute('title').catch(() => null)
      if (title) {
        // Title format: "4.6 out of 5 stars"
        const ratingMatch = title.match(/(\d+\.?\d*)\s+out\s+of\s+5\s+stars/i)
        if (ratingMatch) {
          amazonRatingAverage = parseFloat(ratingMatch[1])
          console.log(`   ⭐ Extracted Amazon rating from title: ${amazonRatingAverage}`)
        }
      }

      // Fallback: Try to get rating from .a-size-small.a-color-base text content
      if (amazonRatingAverage == null) {
        const ratingText = await acrPopover
          .locator('.a-size-small.a-color-base')
          .first()
          .textContent({ timeout: textContentTimeoutMs })
          .catch(() => null)
        if (ratingText) {
          amazonRatingAverage = parseRatingAverageFromText(ratingText) ?? amazonRatingAverage
          if (amazonRatingAverage != null) {
            console.log(`   ⭐ Extracted Amazon rating from text: ${amazonRatingAverage}`)
          }
        }
      }
    }

    // Extract review count from #acrCustomerReviewText
    const reviewCountElement = page.locator('#acrCustomerReviewText').first()
    const reviewCountExists = (await reviewCountElement.count().catch(() => 0)) > 0
    if (reviewCountExists) {
      const reviewCountText = await reviewCountElement.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      if (reviewCountText) {
        amazonRatingCount = parseRatingCountFromText(reviewCountText)
        if (amazonRatingCount != null) {
          console.log(`   📊 Extracted Amazon review count: ${amazonRatingCount}`)
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️ Error extracting Amazon ratings:`, error instanceof Error ? error.message : 'Unknown')
  }

  // Extract Goodreads ratings
  try {
    const goodreadsWidget = page.locator('#goodreadsRatingsWidget_feature_div').first()
    const exists = (await goodreadsWidget.count().catch(() => 0)) > 0

    if (exists) {
      // Extract rating from .gr-review-rating-text
      const ratingElement = goodreadsWidget.locator('.gr-review-rating-text').first()
      const ratingText = await ratingElement.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      if (ratingText) {
        goodreadsRatingAverage = parseRatingAverageFromText(ratingText)
        if (goodreadsRatingAverage != null) {
          console.log(`   ⭐ Extracted Goodreads rating: ${goodreadsRatingAverage}`)
        }
      }

      // Extract count from .gr-review-count-text
      const countElement = goodreadsWidget.locator('.gr-review-count-text').first()
      const countText = await countElement.textContent({ timeout: textContentTimeoutMs }).catch(() => null)
      if (countText) {
        goodreadsRatingCount = parseRatingCountFromText(countText)
        if (goodreadsRatingCount != null) {
          console.log(`   📊 Extracted Goodreads rating count: ${goodreadsRatingCount}`)
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️ Error extracting Goodreads ratings:`, error instanceof Error ? error.message : 'Unknown')
  }

  return { amazonRatingAverage, amazonRatingCount, goodreadsRatingAverage, goodreadsRatingCount }
}

// --- Low-level helpers ---

function parseRatingAverageFromText(text: string): number | null {
  const match = text.match(/(\d+(\.\d+)?)/)
  if (!match) return null
  const value = parseFloat(match[1])
  return Number.isFinite(value) ? value : null
}

function parseRatingCountFromText(text: string): number | null {
  // Prefer explicit labels if present
  const labeled = text.match(/(\d{1,3}(?:,\d{3})*)\s*(ratings?|reviews?)/i)
  if (labeled?.[1]) return parseInt(labeled[1].replace(/,/g, ''), 10)

  // Fallback for formats like "(1,196)"
  const paren = text.match(/\((\d{1,3}(?:,\d{3})*)\)/)
  if (paren?.[1]) return parseInt(paren[1].replace(/,/g, ''), 10)

  // Last resort: first comma-number sequence
  const any = text.match(/(\d{1,3}(?:,\d{3})*)/)
  if (!any?.[1]) return null
  return parseInt(any[1].replace(/,/g, ''), 10)
}

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
 * Navigates to the preferred format (hardcover > paperback > board book/library binding/spiral > kindle > audiobook) and extracts cover.
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
    await waitAfterFormatSwitch(page)

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
