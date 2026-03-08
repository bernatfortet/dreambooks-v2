import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import type { AuthorData } from '@/lib/scraping/domains/author/types'
import type { BookData } from '@/lib/scraping/domains/book/types'
import type { SeriesData } from '@/lib/scraping/domains/series/types'
import { DEFAULT_LOCAL_SCRAPE_SOURCE, type LocalScrapeSource } from '@/lib/scraping/local-source'
import type { Id } from '@/convex/_generated/dataModel'

type ImportBookResult = {
  bookId: string
  isNew: boolean
}

type ImportAuthorResult = {
  authorId: string
  isNew: boolean
  booksLinked: number
}

type SaveSeriesResult = {
  seriesId: string
  booksFound: number
  pending: number
  skipped: number
  hasMorePages: boolean
}

export async function importBookToConvex(params: {
  scrapedData: BookData
  amazonUrl: string
  skipCoverDownload?: boolean
  firstSeenFromUrl?: string
  firstSeenReason?: string
  source?: LocalScrapeSource
}): Promise<ImportBookResult> {
  const client = getConvexClient()
  const apiKey = getScrapeImportKey()
  const { scrapedData, amazonUrl, skipCoverDownload } = params
  const source = params.source ?? DEFAULT_LOCAL_SCRAPE_SOURCE

  console.log('🌀 Importing book to Convex...', { title: scrapedData.title })

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
    amazonAuthorIds: scrapedData.amazonAuthorIds?.length ? scrapedData.amazonAuthorIds : undefined,
    contributors: scrapedData.contributors?.length
      ? scrapedData.contributors.map((contributor) => ({
          name: contributor.name,
          amazonAuthorId: contributor.amazonAuthorId ?? undefined,
          role: contributor.role,
        }))
      : undefined,
    isbn10: scrapedData.isbn10 ?? undefined,
    isbn13: scrapedData.isbn13 ?? undefined,
    asin: scrapedData.asin ?? undefined,
    amazonUrl,
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
    scrapeSource: source,
    skipCoverDownload,
    firstSeenFromUrl: params.firstSeenFromUrl,
    firstSeenReason: params.firstSeenReason,
  })

  console.log('✅ Book imported to Convex', { bookId: result.bookId, isNew: result.isNew })

  return result
}

export async function importAuthorToConvex(params: {
  authorData: Pick<AuthorData, 'name' | 'bio' | 'imageUrl' | 'amazonAuthorId'>
  sourceUrl: string
  firstSeenFromUrl?: string
  firstSeenReason?: string
  source?: LocalScrapeSource
}): Promise<ImportAuthorResult> {
  const client = getConvexClient()
  const apiKey = getScrapeImportKey()
  const source = params.source ?? DEFAULT_LOCAL_SCRAPE_SOURCE

  if (!params.authorData.name) {
    throw new Error('Missing required field: name')
  }

  if (!params.authorData.amazonAuthorId) {
    throw new Error('Missing required field: amazonAuthorId')
  }

  console.log('🌀 Importing author to Convex...', {
    name: params.authorData.name,
    amazonAuthorId: params.authorData.amazonAuthorId,
  })

  const result = await client.action(api.scraping.importAuthor.importFromLocalScrape, {
    authorData: {
      name: params.authorData.name,
      bio: params.authorData.bio ?? undefined,
      amazonAuthorId: params.authorData.amazonAuthorId,
      sourceUrl: params.sourceUrl,
      imageUrl: params.authorData.imageUrl ?? undefined,
    },
    apiKey,
    scrapeSource: source,
    firstSeenFromUrl: params.firstSeenFromUrl,
    firstSeenReason: params.firstSeenReason,
  })

  console.log('✅ Author imported to Convex', {
    authorId: result.authorId,
    isNew: result.isNew,
    booksLinked: result.booksLinked,
  })

  return result
}

export async function saveSeriesToConvex(params: {
  seriesData: SeriesData
  sourceUrl: string
  skipCoverDownload?: boolean
  firstSeenFromUrl?: string
  firstSeenReason?: string
  source?: LocalScrapeSource
}): Promise<SaveSeriesResult> {
  const client = getConvexClient()
  const source = params.source ?? DEFAULT_LOCAL_SCRAPE_SOURCE

  if (!params.seriesData.name) {
    throw new Error('Missing required field: name')
  }

  console.log('🌀 Saving series to Convex...', {
    name: params.seriesData.name,
    sourceUrl: params.sourceUrl,
  })

  const seriesId = await client.mutation(api.series.mutations.upsertFromUrl, {
    name: params.seriesData.name,
    sourceUrl: params.sourceUrl,
    description: params.seriesData.description ?? undefined,
    coverImageUrl: params.seriesData.coverImageUrl ?? undefined,
    skipCoverDownload: params.skipCoverDownload,
    firstSeenFromUrl: params.firstSeenFromUrl,
    firstSeenReason: params.firstSeenReason,
  })

  const saveResult = await client.mutation(api.series.mutations.saveFromCliScrape, {
    seriesId: seriesId as Id<'series'>,
    seriesName: params.seriesData.name,
    sourceUrl: params.sourceUrl,
    scrapeSource: source,
    description: params.seriesData.description ?? undefined,
    coverImageUrl: params.seriesData.coverImageUrl ?? undefined,
    expectedBookCount: params.seriesData.totalBooks ?? undefined,
    skipCoverDownload: params.skipCoverDownload,
    books: params.seriesData.books
      .filter((book) => book.amazonUrl && book.format !== 'audiobook')
      .map((book) => ({
        title: book.title ?? 'Unknown Title',
        amazonUrl: book.amazonUrl!,
        asin: book.asin ?? undefined,
        position: book.position ?? undefined,
        coverImageUrl: book.coverImageUrl ?? undefined,
        authors: book.authors.length > 0 ? book.authors : undefined,
      })),
    pagination: params.seriesData.pagination
      ? {
          currentPage: params.seriesData.pagination.currentPage,
          totalPages: params.seriesData.pagination.totalPages ?? undefined,
          nextPageUrl: params.seriesData.pagination.nextPageUrl ?? undefined,
        }
      : undefined,
  })

  console.log('✅ Series saved to Convex', {
    seriesId,
    booksFound: saveResult.booksFound,
    pending: saveResult.pending,
    skipped: saveResult.skipped,
  })

  return {
    seriesId,
    booksFound: saveResult.booksFound,
    pending: saveResult.pending,
    skipped: saveResult.skipped,
    hasMorePages: saveResult.hasMorePages,
  }
}

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.CONVEX_URL

  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }

  return new ConvexHttpClient(convexUrl)
}

function getScrapeImportKey(): string {
  const apiKey = process.env.SCRAPE_IMPORT_KEY

  if (!apiKey) {
    throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
  }

  return apiKey
}
