// Format priority: higher number = more preferred
export const FORMAT_PRIORITY: Record<string, number> = {
  hardcover: 4,
  paperback: 3,
  kindle: 2,
  audiobook: 1,
  unknown: 0,
}

// Cover source priority: paperback preferred (Kindle often has "Kindle Unlimited" branding)
export const COVER_FORMAT_PRIORITY: Record<string, number> = {
  paperback: 5, // Clean scans, no branding
  kindle: 3, // Sometimes has "Kindle Unlimited" overlay
  hardcover: 2, // Sometimes physical book photos
  board_book: 1,
  audiobook: 0,
  unknown: 0,
}

export type BookFormat = {
  type: string // 'hardcover', 'paperback', 'kindle', 'audiobook', etc.
  asin: string
  amazonUrl: string
}

export type BookData = {
  title: string | null
  authors: string[]
  // Amazon author IDs extracted from byline links - used for linking to authors table
  amazonAuthorIds: string[]
  isbn10: string | null
  isbn13: string | null
  asin: string | null
  publisher: string | null
  publishedDate: string | null
  pageCount: number | null
  description: string | null
  coverImageUrl: string | null
  coverSourceFormat: string | null // 'kindle' | 'paperback' | 'hardcover' | etc. (normalized)
  coverSourceAsin: string | null // ASIN of the edition used for cover
  lexileScore: number | null
  // Age range - numeric for filtering, raw string kept for reference
  ageRangeMin: number | null
  ageRangeMax: number | null
  ageRangeRaw: string | null // Original string from source (e.g., "4 - 8 years")
  // Grade level - numeric for filtering, raw string kept for reference
  gradeLevelMin: number | null
  gradeLevelMax: number | null
  gradeLevelRaw: string | null // Original string from source (e.g., "3 - 7", "Preschool - 3")
  // Series info
  seriesName: string | null
  seriesUrl: string | null
  seriesPosition: number | null
  // Available formats
  formats: BookFormat[]
}

// Type representing what Firecrawl extraction returns (matches bookExtractionSchema)
export type BookExtractionResult = {
  title?: string
  authors?: string[]
  isbn10?: string
  isbn13?: string
  asin?: string
  publisher?: string
  publishedDate?: string
  pageCount?: number
  description?: string
  coverImageUrl?: string
  lexileScore?: number
  ageRange?: string // Note: extraction schema uses 'ageRange', BookData uses 'ageRangeRaw'
  gradeLevel?: string
  seriesName?: string
  seriesUrl?: string
  seriesPosition?: number
}

// Firecrawl extraction schema (JSON Schema format)
export const bookExtractionSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Book title without series info' },
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
