import { ScrapeResult, ScrapeOptions, Provider } from '../../types'
import { withBrowser, navigateWithRetry } from '../../providers/playwright'
import { extract } from '../../providers/firecrawl'
import { BookData, bookExtractionSchema, bookExtractionPrompt } from './types'
import { parseBookFromPage } from './parse'
import { extractAsinFromUrl } from '../../utils/amazon-url'

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
  const result = await extract<BookData>({
    url,
    schema: bookExtractionSchema,
    prompt: bookExtractionPrompt,
  })

  if (!result.success) return result

  // Normalize the response to match BookData (Firecrawl may return undefined vs null)
  // Note: Firecrawl extraction can't get amazonAuthorIds or formats from links
  const normalized: BookData = {
    title: result.data.title ?? null,
    subtitle: result.data.subtitle ?? null,
    authors: result.data.authors ?? [],
    amazonAuthorIds: [], // Firecrawl can't extract this from links
    isbn10: result.data.isbn10 ?? null,
    isbn13: result.data.isbn13 ?? null,
    asin: result.data.asin ?? null,
    publisher: result.data.publisher ?? null,
    publishedDate: result.data.publishedDate ?? null,
    pageCount: result.data.pageCount ?? null,
    description: result.data.description ?? null,
    coverImageUrl: result.data.coverImageUrl ?? null,
    lexileScore: result.data.lexileScore ?? null,
    ageRange: result.data.ageRange ?? null,
    gradeLevel: result.data.gradeLevel ?? null,
    seriesName: result.data.seriesName ?? null,
    seriesUrl: result.data.seriesUrl ?? null,
    seriesPosition: result.data.seriesPosition ?? null,
    formats: [], // Firecrawl can't extract format options
  }

  return { success: true, data: normalized }
}

// Re-export for backward compatibility
export { extractAsinFromUrl } from '../../utils/amazon-url'
