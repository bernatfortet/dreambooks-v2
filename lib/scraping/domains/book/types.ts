export type BookData = {
  title: string | null
  subtitle: string | null
  authors: string[]
  isbn10: string | null
  isbn13: string | null
  asin: string | null
  publisher: string | null
  publishedDate: string | null
  pageCount: number | null
  description: string | null
  coverImageUrl: string | null
  lexileScore: number | null
  ageRange: string | null
  gradeLevel: string | null
  // Series info
  seriesName: string | null
  seriesUrl: string | null
  seriesPosition: number | null
}

// Firecrawl extraction schema (JSON Schema format)
export const bookExtractionSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Book title without series info' },
    subtitle: { type: 'string' },
    authors: { type: 'array', items: { type: 'string' } },
    isbn10: { type: 'string' },
    isbn13: { type: 'string' },
    asin: { type: 'string' },
    publisher: { type: 'string' },
    publishedDate: { type: 'string' },
    pageCount: { type: 'number' },
    description: {
      type: 'string',
      description: 'Clean book description suitable for SEO, 150-300 chars, no marketing fluff',
    },
    coverImageUrl: { type: 'string' },
    lexileScore: { type: 'number' },
    ageRange: { type: 'string' },
    gradeLevel: { type: 'string' },
    seriesName: { type: 'string', description: 'Name of the book series if part of one' },
    seriesUrl: { type: 'string', description: 'Amazon URL to the series page if available' },
    seriesPosition: { type: 'number', description: 'Book number in the series (e.g., Book 1)' },
  },
  required: ['title', 'authors'],
}

export const bookExtractionPrompt = `Extract book information from this Amazon product page:

1. TITLE: Get the clean book title (without "Book X" or series name appended)
2. AUTHORS: List all authors
3. IDENTIFIERS: ISBN-10, ISBN-13, ASIN
4. DESCRIPTION: Extract a clean, SEO-friendly description (150-300 chars). 
   - Use the editorial review or product description
   - Remove marketing phrases like "New York Times Bestseller"
   - Focus on what the book is about
5. SERIES: If this book is part of a series:
   - seriesName: The series name (e.g., "Harry Potter")
   - seriesUrl: The Amazon URL to the series page
   - seriesPosition: Which book number (e.g., 1 for "Book 1")
6. COVER IMAGE: Get the highest resolution cover image URL available
7. OTHER: Publisher, publication date, page count, reading level if shown`
