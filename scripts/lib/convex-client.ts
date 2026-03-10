import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import type { BookData } from '@/lib/scraping/domains/book/types'
import { FORMAT_PRIORITY, isAudioFormat } from '@/lib/scraping/domains/book/types'

type ImportResult = {
  bookId: string
  isNew: boolean
}

export async function importBookToConvex(params: {
  scrapedData: BookData
  amazonUrl: string
  skipCoverDownload?: boolean
  firstSeenFromUrl?: string
  firstSeenReason?: string
}): Promise<ImportResult> {
  const { scrapedData, amazonUrl, skipCoverDownload } = params

  const convexUrl = process.env.CONVEX_URL
  const apiKey = process.env.SCRAPE_IMPORT_KEY

  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }

  if (!apiKey) {
    throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
  }

  console.log('🌀 Importing book to Convex...', { title: scrapedData.title })

  const client = new ConvexHttpClient(convexUrl)

  // Validate required fields
  if (!scrapedData.title) {
    throw new Error('Missing required field: title')
  }

  if (!scrapedData.authors?.length) {
    throw new Error('Missing required field: authors')
  }

  // Transform null values to undefined (Convex validators don't accept null)
  const canonicalAmazonUrl = getCanonicalAmazonUrl(scrapedData, amazonUrl)

  const cleanedData = {
    title: scrapedData.title,
    authors: scrapedData.authors,
    amazonAuthorIds: scrapedData.amazonAuthorIds?.length ? scrapedData.amazonAuthorIds : undefined,
    contributors: scrapedData.contributors?.length
      ? scrapedData.contributors.map((c) => ({
          name: c.name,
          amazonAuthorId: c.amazonAuthorId ?? undefined,
          role: c.role,
        }))
      : undefined,
    isbn10: scrapedData.isbn10 ?? undefined,
    isbn13: scrapedData.isbn13 ?? undefined,
    asin: scrapedData.asin ?? undefined,
    amazonUrl: canonicalAmazonUrl,
    publisher: scrapedData.publisher ?? undefined,
    publishedDate: scrapedData.publishedDate ?? undefined,
    pageCount: scrapedData.pageCount ?? undefined,
    description: scrapedData.description ?? undefined,
    coverImageUrl: scrapedData.coverImageUrl ?? undefined,
    coverWidth: scrapedData.coverWidth ?? undefined,
    coverHeight: scrapedData.coverHeight ?? undefined,
    coverSourceFormat: scrapedData.coverSourceFormat ?? undefined,
    coverSourceAsin: scrapedData.coverSourceAsin ?? undefined,
    lexileScore: scrapedData.lexileScore ?? undefined,
    ageRangeMin: scrapedData.ageRangeMin ?? undefined,
    ageRangeMax: scrapedData.ageRangeMax ?? undefined,
    ageRange: scrapedData.ageRangeRaw ?? undefined,
    gradeLevelMin: scrapedData.gradeLevelMin ?? undefined,
    gradeLevelMax: scrapedData.gradeLevelMax ?? undefined,
    gradeLevel: scrapedData.gradeLevelRaw ?? undefined,
    // Ratings (scraped, never displayed - used only for sorting)
    amazonRatingAverage: scrapedData.amazonRatingAverage ?? undefined,
    amazonRatingCount: scrapedData.amazonRatingCount ?? undefined,
    goodreadsRatingAverage: scrapedData.goodreadsRatingAverage ?? undefined,
    goodreadsRatingCount: scrapedData.goodreadsRatingCount ?? undefined,
    ratingScore: scrapedData.ratingScore ?? undefined,
    seriesName: scrapedData.seriesName ?? undefined,
    seriesUrl: scrapedData.seriesUrl ?? undefined,
    seriesPosition: scrapedData.seriesPosition ?? undefined,
    formats: scrapedData.formats?.length ? scrapedData.formats : undefined,
    editions: scrapedData.editions?.length
      ? scrapedData.editions.map((edition) => ({
          format: edition.format,
          asin: edition.asin,
          amazonUrl: edition.amazonUrl,
          isbn10: edition.isbn10 ?? undefined,
          isbn13: edition.isbn13 ?? undefined,
          mainCoverUrl: edition.mainCoverUrl ?? undefined,
          coverWidth: edition.coverWidth ?? undefined,
          coverHeight: edition.coverHeight ?? undefined,
        }))
      : undefined,
  }

  const result = await client.action(api.scraping.importBook.importFromLocalScrape, {
    scrapedData: cleanedData,
    apiKey,
    skipCoverDownload,
    firstSeenFromUrl: params.firstSeenFromUrl,
    firstSeenReason: params.firstSeenReason,
  })

  console.log('✅ Book imported to Convex', { bookId: result.bookId, isNew: result.isNew })

  return result
}

function getCanonicalAmazonUrl(scrapedData: BookData, fallbackUrl: string): string {
  const canonicalFormat = pickCanonicalFormat(scrapedData)
  if (canonicalFormat?.amazonUrl) return canonicalFormat.amazonUrl
  if (scrapedData.asin) return `https://www.amazon.com/dp/${scrapedData.asin}`
  return fallbackUrl
}

function pickCanonicalFormat(scrapedData: BookData) {
  const formats = scrapedData.formats.filter((format) => !isAudioFormat(format.type))
  if (formats.length === 0) return null

  if (scrapedData.asin) {
    const canonicalByAsin = formats.find((format) => format.asin === scrapedData.asin)
    if (canonicalByAsin) return canonicalByAsin
  }

  return [...formats].sort((left, right) => {
    const leftPriority = FORMAT_PRIORITY[left.type] ?? 0
    const rightPriority = FORMAT_PRIORITY[right.type] ?? 0
    return rightPriority - leftPriority
  })[0]
}

