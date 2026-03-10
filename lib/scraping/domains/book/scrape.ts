import { ScrapeResult, ScrapeOptions, Provider } from '@/lib/scraping/types'
import { withBrowser, navigateWithRetry } from '@/lib/scraping/providers/playwright/browser'
import { extract } from '@/lib/scraping/providers/firecrawl/client'
import { BookData, BookExtractionResult, bookExtractionSchema, bookExtractionPrompt } from './types'
import { parseBookFromPage } from './parse'
import { parseAgeRange } from '@/lib/utils/age-range'
import { parseGradeLevel } from '@/lib/utils/grade-level'

const DEFAULT_PROVIDER: Provider = 'playwright'

/**
 * Scrape book data from an Amazon URL.
 * Uses the specified provider (defaults to playwright for better bot bypassing).
 */
export async function scrapeBook(url: string, options?: ScrapeOptions): Promise<ScrapeResult<BookData>> {
  const provider = options?.provider ?? DEFAULT_PROVIDER

  console.log('🏁 Starting book scrape', { url, provider })

  if (provider === 'playwright') {
    return scrapeBookWithPlaywright(url, options)
  }

  return scrapeBookWithFirecrawl(url)
}

async function scrapeBookWithPlaywright(url: string, options?: ScrapeOptions): Promise<ScrapeResult<BookData>> {
  const headless = options?.headless ?? true

  const result = await withBrowser({
    config: { headless },
    action: async (page) => {
      await navigateWithRetry({ page, url })
      const bookData = await parseBookFromPage(page)

      return bookData
    },
  })

  return result
}

async function scrapeBookWithFirecrawl(url: string): Promise<ScrapeResult<BookData>> {
  const result = await extract<BookExtractionResult>({
    url,
    schema: bookExtractionSchema,
    prompt: bookExtractionPrompt,
  })

  if (!result.success) return result

  // Normalize the response to match BookData (Firecrawl may return undefined vs null)
  // Note: Firecrawl extraction can't get amazonAuthorIds or formats from links
  const ageRangeRaw = result.data.ageRange ?? null
  const parsedAgeRange = parseAgeRange(ageRangeRaw)
  const gradeLevelRaw = result.data.gradeLevel ?? null
  const parsedGradeLevel = parseGradeLevel(gradeLevelRaw)

  const normalized: BookData = {
    title: result.data.title ?? null,
    subtitle: null,
    authors: result.data.authors ?? [],
    amazonAuthorIds: [], // Firecrawl can't extract this from links
    contributors: (result.data.authors ?? []).map((name) => ({
      name,
      amazonAuthorId: null, // Firecrawl can't extract author IDs from links
      role: 'author' as const,
    })),
    isbn10: result.data.isbn10 ?? null,
    isbn13: result.data.isbn13 ?? null,
    asin: result.data.asin ?? null,
    publisher: result.data.publisher ?? null,
    publishedDate: result.data.publishedDate ?? null,
    language: null,
    pageCount: result.data.pageCount ?? null,
    description: result.data.description ?? null,
    coverImageUrl: result.data.coverImageUrl ?? null,
    coverWidth: null,
    coverHeight: null,
    coverSourceFormat: null, // Firecrawl can't detect format
    coverSourceAsin: null, // Firecrawl can't detect format
    lexileScore: result.data.lexileScore ?? null,
    ageRangeMin: parsedAgeRange?.min ?? null,
    ageRangeMax: parsedAgeRange?.max ?? null,
    ageRangeRaw,
    gradeLevelMin: parsedGradeLevel?.min ?? null,
    gradeLevelMax: parsedGradeLevel?.max ?? null,
    gradeLevelRaw,
    seriesName: result.data.seriesName ?? null,
    seriesUrl: result.data.seriesUrl ?? null,
    seriesPosition: result.data.seriesPosition ?? null,
    amazonRatingAverage: null,
    amazonRatingCount: null,
    goodreadsRatingAverage: null,
    goodreadsRatingCount: null,
    ratingScore: null,
    formats: [], // Firecrawl can't extract format options
    editions: [], // Firecrawl can't extract edition data
    categories: [],
  }

  return { success: true, data: normalized }
}
