'use node'

import { internalAction } from '../../../_generated/server'
import { v } from 'convex/values'
import FirecrawlApp from '@mendable/firecrawl-js'

export type ScrapedSeriesData = {
  seriesName: string
  description?: string
  coverImageUrl?: string
  expectedBookCount?: number
  books: Array<{
    title: string
    amazonUrl: string
    asin?: string
    position?: number
  }>
  pagination?: {
    currentPage: number
    totalPages: number
    nextPageUrl?: string
  }
}

// Schema for series page extraction (JSON Schema format for Firecrawl)
const seriesSchema = {
  type: 'object',
  properties: {
    seriesName: {
      type: 'string',
      description: 'Name of the book series',
    },
    description: {
      type: 'string',
      description: 'Series description if available',
    },
    coverImageUrl: {
      type: 'string',
      description: 'Series cover/banner image URL',
    },
    expectedBookCount: {
      type: 'number',
      description: 'Total number of books in series (from "X books in series" text)',
    },
    books: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Book title' },
          amazonUrl: { type: 'string', description: 'Amazon product URL for this book' },
          asin: { type: 'string', description: 'ASIN extracted from URL or page' },
          position: { type: 'number', description: 'Book number in series (1, 2, 3...)' },
        },
        required: ['title', 'amazonUrl'],
      },
      description: 'List of books in the series shown on this page',
    },
    pagination: {
      type: 'object',
      properties: {
        currentPage: { type: 'number' },
        totalPages: { type: 'number' },
        nextPageUrl: { type: 'string' },
      },
      description: 'Pagination info if series spans multiple pages',
    },
  },
  required: ['seriesName', 'books'],
}

const EXTRACTION_PROMPT = `Extract book series information from this Amazon series page:

1. SERIES NAME: The name of the book series
2. DESCRIPTION: Series description if shown
3. EXPECTED BOOK COUNT: Look for text like "X books in this series" - extract the number
4. COVER IMAGE: The series banner/cover image URL if present
5. BOOKS: For each book listed on this page:
   - title: The book title (clean, without series name appended)
   - amazonUrl: The full Amazon product URL
   - asin: The ASIN (10-character identifier, often in the URL)
   - position: Book number (Book 1, Book 2, etc.)
6. PAGINATION: If there are multiple pages:
   - currentPage: Which page number we're on
   - totalPages: Total number of pages
   - nextPageUrl: URL to the next page if there is one

Important: 
- Extract ALL books shown on this page
- Each book must have at minimum a title and amazonUrl
- For position, extract the number from "Book 1", "Book 2", etc.`

export const crawlSeriesWithAmazon = internalAction({
  args: { url: v.string() },
  handler: async (_context, args): Promise<ScrapedSeriesData> => {
    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) throw new Error('FIRECRAWL_API_KEY environment variable is not set')

    const firecrawl = new FirecrawlApp({ apiKey })

    console.log('🏁 Starting Amazon series extraction', { url: args.url })

    const result = await firecrawl.extract({
      urls: [args.url],
      schema: seriesSchema,
      prompt: EXTRACTION_PROMPT,
    })

    if (!result.success || !result.data) {
      console.log('🚨 Series extraction failed', { error: result.error })
      throw new Error(`Series extraction failed: ${result.error}`)
    }

    const data = result.data as ScrapedSeriesData

    console.log('✅ Series extraction complete', {
      seriesName: data.seriesName,
      bookCount: data.books?.length ?? 0,
      expectedBookCount: data.expectedBookCount,
    })

    return data
  },
})
