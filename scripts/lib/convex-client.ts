import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import { BookData } from '../../lib/scraping'

type ImportResult = {
  bookId: string
  isNew: boolean
}

export async function importBookToConvex(params: {
  scrapedData: BookData
  amazonUrl: string
}): Promise<ImportResult> {
  const { scrapedData, amazonUrl } = params

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
  const cleanedData = {
    title: scrapedData.title,
    subtitle: scrapedData.subtitle ?? undefined,
    authors: scrapedData.authors,
    isbn10: scrapedData.isbn10 ?? undefined,
    isbn13: scrapedData.isbn13 ?? undefined,
    asin: scrapedData.asin ?? undefined,
    amazonUrl,
    publisher: scrapedData.publisher ?? undefined,
    publishedDate: scrapedData.publishedDate ?? undefined,
    pageCount: scrapedData.pageCount ?? undefined,
    description: scrapedData.description ?? undefined,
    coverImageUrl: scrapedData.coverImageUrl ?? undefined,
    lexileScore: scrapedData.lexileScore ?? undefined,
    ageRange: scrapedData.ageRange ?? undefined,
    gradeLevel: scrapedData.gradeLevel ?? undefined,
    seriesName: scrapedData.seriesName ?? undefined,
    seriesUrl: scrapedData.seriesUrl ?? undefined,
    seriesPosition: scrapedData.seriesPosition ?? undefined,
  }

  const result = await client.action(api.scraping.importBook.importFromLocalScrape, {
    scrapedData: cleanedData,
    apiKey,
  })

  console.log('✅ Book imported to Convex', { bookId: result.bookId, isNew: result.isNew })

  return result
}
