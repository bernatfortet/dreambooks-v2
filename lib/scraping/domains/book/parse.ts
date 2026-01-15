import type { Page } from 'playwright'
import { BookData } from './types'

/**
 * Parse book data from an Amazon product page using Playwright.
 * Extracts title, authors, ISBNs, series info, etc.
 */
export async function parseBookFromPage(page: Page): Promise<BookData> {
  console.log('🌀 Parsing Amazon book page...')

  const title = await extractTitle(page)
  const subtitle = await extractSubtitle(page)
  const authors = await extractAuthors(page)
  const { isbn10, isbn13 } = await extractIsbns(page)
  const asin = await extractAsin(page)
  const { publisher, publishedDate } = await extractPublisherInfo(page)
  const pageCount = await extractPageCount(page)
  const description = await extractDescription(page)
  const coverImageUrl = await extractCoverImage(page)
  const { seriesName, seriesUrl, seriesPosition } = await extractSeriesInfo(page)
  const { lexileScore, ageRange, gradeLevel } = await extractReadingLevel(page)

  const bookData: BookData = {
    title,
    subtitle,
    authors,
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
  }

  console.log('✅ Parsed book data:', {
    title: bookData.title,
    authors: bookData.authors,
    seriesName: bookData.seriesName,
  })

  return bookData
}

// --- Extraction helpers ---

async function extractTitle(page: Page): Promise<string | null> {
  try {
    const text = await page.locator('#productTitle').textContent()
    return text?.trim() ?? null
  } catch {
    return null
  }
}

async function extractSubtitle(page: Page): Promise<string | null> {
  try {
    const text = await page.locator('#productSubtitle').textContent()
    return text?.trim() ?? null
  } catch {
    return null
  }
}

async function extractAuthors(page: Page): Promise<string[]> {
  const authors: string[] = []

  try {
    const contributorElements = await page.locator('#bylineInfo .author').all()

    for (const element of contributorElements) {
      const name = await element.locator('a.a-link-normal').textContent()
      if (name) authors.push(name.trim())
    }
  } catch {
    try {
      const authorLink = await page.locator('#bylineInfo a.a-link-normal').first().textContent()
      if (authorLink) authors.push(authorLink.trim())
    } catch {
      // No authors found
    }
  }

  return authors
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
    let text = await page.locator('#bookDescription_feature_div .a-expander-content').textContent()
    if (text) return text.trim().replace(/\s{2,}/g, ' ')

    text = await page.locator('#productDescription p').textContent()
    return text?.trim().replace(/\s{2,}/g, ' ') ?? null
  } catch {
    return null
  }
}

async function extractCoverImage(page: Page): Promise<string | null> {
  try {
    const dynamicImage = await page.locator('#imgTagWrapperId img').getAttribute('data-a-dynamic-image')

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

    const src = await page.locator('#imgTagWrapperId img').getAttribute('src')
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
    const seriesSelectors = [
      '#seriesBullet a',
      'a[href*="/series/"]',
      '#booksTitle .a-link-normal[href*="/dp/"]',
      '.series-childAsin-widget a',
      '#kindle-meta-binding a[href*="/dp/"]',
    ]

    let seriesName: string | null = null
    let seriesUrl: string | null = null
    let seriesPosition: number | null = null

    for (const selector of seriesSelectors) {
      const seriesLink = page.locator(selector).first()
      const isVisible = await seriesLink.isVisible({ timeout: 500 }).catch(() => false)

      if (isVisible) {
        seriesName = await seriesLink.textContent()
        seriesUrl = await seriesLink.getAttribute('href')

        if (seriesName && seriesUrl) break
      }
    }

    if (!seriesName) {
      const metaText = await page.locator('#title, #productSubtitle, #bylineInfo').allTextContents()
      const combinedText = metaText.join(' ')

      const seriesMatch = combinedText.match(/Book\s+(\d+)\s+of\s+\d+[:\s]+([^()\n]+)/i)
      if (seriesMatch) {
        seriesPosition = parseInt(seriesMatch[1], 10)
        seriesName = seriesMatch[2].trim()
      }
    }

    if (!seriesName) {
      const title = await page.locator('#productTitle').textContent()
      if (title) {
        const titleSeriesMatch = title.match(/\(([^)]+?)\s*[#,]?\s*(?:Book\s*)?(\d+)\)/)
        if (titleSeriesMatch) {
          seriesName = titleSeriesMatch[1].trim()
          seriesPosition = parseInt(titleSeriesMatch[2], 10)
        }
      }
    }

    if (!seriesPosition && seriesName) {
      const pageText = await page.locator('#seriesBullet, #title, #booksTitle').textContent()
      const positionMatch = pageText?.match(/Book\s+(\d+)/i)
      seriesPosition = positionMatch ? parseInt(positionMatch[1], 10) : null
    }

    if (seriesUrl && !seriesUrl.startsWith('http')) {
      seriesUrl = `https://www.amazon.com${seriesUrl}`
    }

    return {
      seriesName: seriesName?.trim() ?? null,
      seriesUrl,
      seriesPosition,
    }
  } catch {
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
    const detailItem = page.locator('#detailBullets_feature_div li .a-list-item').filter({ hasText: label })
    const count = await detailItem.count()

    if (count === 0) return null

    const text = await detailItem.locator('span:last-child').textContent()
    return text?.trim() ?? null
  } catch {
    return null
  }
}

function extractImageSize(url: string): number {
  const match = url.match(/_S[XLY](\d+)_/)
  return match ? parseInt(match[1], 10) : 0
}
