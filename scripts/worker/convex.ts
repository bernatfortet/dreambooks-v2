import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

let clientInstance: ConvexHttpClient | null = null

/**
 * Get the Convex HTTP client (singleton).
 */
export function getConvexClient(): ConvexHttpClient {
  if (clientInstance) return clientInstance

  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }

  clientInstance = new ConvexHttpClient(convexUrl)
  return clientInstance
}

// --- Queue operations ---

export type QueueItem = {
  _id: Id<'scrapeQueue'>
  url: string
  type: 'book' | 'series' | 'author'
  scrapeFullSeries: boolean
  priority: number
  createdAt: number
}

export async function fetchPendingQueueItems(limit: number = 5): Promise<QueueItem[]> {
  const client = getConvexClient()
  const items = await client.query(api.scrapeQueue.queries.listPending, { limit })
  return items as QueueItem[]
}

/**
 * @deprecated Use claimQueueItem instead for safe concurrent processing.
 */
export async function markQueueItemProcessing(queueId: Id<'scrapeQueue'>): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.scrapeQueue.mutations.markProcessing, { queueId })
}

/**
 * Claim a queue item for processing with a lease.
 * Returns { success: true } if claimed, { success: false, reason } if not available.
 */
export async function claimQueueItem(
  queueId: Id<'scrapeQueue'>,
  workerId: string
): Promise<{ success: boolean; reason?: string }> {
  const client = getConvexClient()
  return await client.mutation(api.scrapeQueue.mutations.claimItem, { queueId, workerId })
}

export async function markQueueItemComplete(params: {
  queueId: Id<'scrapeQueue'>
  bookId?: Id<'books'>
  seriesId?: Id<'series'>
  authorId?: Id<'authors'>
}): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.scrapeQueue.mutations.markComplete, params)
}

export async function markQueueItemError(queueId: Id<'scrapeQueue'>, errorMessage: string): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.scrapeQueue.mutations.markError, { queueId, errorMessage })
}

export async function queueDiscoveries(discoveries: Array<{ type: 'book' | 'series' | 'author'; url: string; priority: number; source: string }>): Promise<number> {
  const client = getConvexClient()
  return await client.mutation(api.scrapeQueue.mutations.enqueueDiscoveries, { discoveries })
}

/**
 * Re-queue a URL with a different type.
 * Removes the current item and enqueues a new one with the correct type.
 */
export async function requeueAsType(params: {
  currentQueueId: Id<'scrapeQueue'>
  url: string
  newType: 'book' | 'series' | 'author'
  priority?: number
}): Promise<void> {
  const client = getConvexClient()

  // Remove the current item
  await client.mutation(api.scrapeQueue.mutations.remove, { queueId: params.currentQueueId })

  // Enqueue with the correct type
  await client.mutation(api.scrapeQueue.mutations.enqueue, {
    url: params.url,
    type: params.newType,
    priority: params.priority ?? 20, // Higher priority since we detected the correct type
  })
}

// --- Book operations ---

export type BookToEnrich = {
  _id: Id<'books'>
  title: string
  amazonUrl?: string
  asin?: string
  detailsStatus?: string
}

export async function fetchBooksNeedingEnrichment(limit: number = 5): Promise<BookToEnrich[]> {
  const client = getConvexClient()
  const books = await client.query(api.books.queries.listNeedingEnrichment, { limit })
  return books as BookToEnrich[]
}

export async function updateBookFromEnrichment(
  bookId: Id<'books'>,
  data: Record<string, any>,
  amazonUrl: string
): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.books.mutations.updateFromEnrichment, {
    bookId,
    amazonUrl,
    subtitle: data.subtitle ?? undefined,
    isbn10: data.isbn10 ?? undefined,
    isbn13: data.isbn13 ?? undefined,
    asin: data.asin ?? undefined,
    publisher: data.publisher ?? undefined,
    publishedDate: data.publishedDate ?? undefined,
    pageCount: data.pageCount ?? undefined,
    description: data.description ?? undefined,
    coverImageUrl: data.coverImageUrl ?? undefined,
    lexileScore: data.lexileScore ?? undefined,
    ageRange: data.ageRange ?? undefined,
    gradeLevel: data.gradeLevel ?? undefined,
    seriesName: data.seriesName ?? undefined,
    seriesUrl: data.seriesUrl ?? undefined,
    seriesPosition: data.seriesPosition ?? undefined,
    formats: data.formats?.length ? data.formats : undefined,
  })
}

export async function markBookEnrichmentError(bookId: Id<'books'>, errorMessage: string): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.books.mutations.markEnrichmentError, { bookId, errorMessage })
}

// --- Series operations ---

export type SeriesToScrape = {
  _id: Id<'series'>
  name: string
  sourceUrl?: string
  nextPageUrl?: string
  scrapeStatus: string
}

export async function fetchSeriesNeedingScrape(limit: number = 3): Promise<SeriesToScrape[]> {
  const client = getConvexClient()
  const series = await client.query(api.series.queries.listNeedingScrape, { limit })
  return series as SeriesToScrape[]
}

export type SeriesNeedingUrl = {
  _id: Id<'series'>
  name: string
  bookAmazonUrl: string
}

export async function fetchSeriesNeedingUrlDiscovery(limit: number = 3): Promise<SeriesNeedingUrl[]> {
  const client = getConvexClient()
  const series = await client.query(api.series.queries.listNeedingUrlDiscovery, { limit })
  return series as SeriesNeedingUrl[]
}

export async function updateSeriesSourceUrl(seriesId: Id<'series'>, sourceUrl: string): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.series.mutations.updateSourceUrl, { seriesId, sourceUrl })
}

export async function saveSeriesFromScrape(
  seriesId: Id<'series'>,
  data: {
    seriesName: string
    description?: string
    coverImageUrl?: string
    expectedBookCount?: number
    books: Array<{
      title: string
      amazonUrl: string
      asin?: string
      position?: number
      coverImageUrl?: string
      authors?: string[]
    }>
    pagination?: {
      currentPage: number
      totalPages?: number
      nextPageUrl?: string
    }
  }
): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.series.mutations.saveFromCliScrape, {
    seriesId,
    ...data,
  })
}

// Re-export types
export type { Id } from '../../convex/_generated/dataModel'
