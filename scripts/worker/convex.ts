import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

const workerApi = api.worker

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

type PendingQueueItems = NonNullable<FunctionReturnType<typeof workerApi.listPendingQueueItems>>
type SeriesNeedingScrapeList = NonNullable<FunctionReturnType<typeof api.series.queries.listNeedingScrape>>
type SeriesNeedingUrlDiscoveryList = NonNullable<FunctionReturnType<typeof api.series.queries.listNeedingUrlDiscovery>>

export type QueueItem = PendingQueueItems[number]

export async function fetchPendingQueueItems(limit: number = 5): Promise<QueueItem[]> {
  const { client, apiKey } = getWorkerContext()
  const items = await client.query(workerApi.listPendingQueueItems, {
    apiKey,
    limit,
  })
  return items as QueueItem[]
}

export type BookIntakeItem = NonNullable<FunctionReturnType<typeof api.bookIntake.worker.claimNextPending>>

export async function claimNextBookIntake(workerId: string): Promise<BookIntakeItem | null> {
  const { client, apiKey } = getWorkerContext()
  const item = await client.action(api.bookIntake.worker.claimNextPending, {
    apiKey,
    workerId,
  })
  return item
}

export async function markBookIntakeNeedsReview(params: {
  intakeId: Id<'bookIntake'>
  reason?: string
  candidateSnapshotJson?: string
  matchedAsin?: string
  matchedAmazonUrl?: string
}): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.action(api.bookIntake.worker.markNeedsReview, {
    apiKey,
    ...params,
  })
}

export async function markBookIntakeFailed(intakeId: Id<'bookIntake'>, errorMessage: string): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.action(api.bookIntake.worker.markFailed, {
    apiKey,
    intakeId,
    errorMessage,
  })
}

export async function markBookIntakeResolvedExisting(params: {
  intakeId: Id<'bookIntake'>
  bookId: Id<'books'>
}): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.action(api.bookIntake.worker.markResolvedExisting, {
    apiKey,
    ...params,
  })
}

export async function markBookIntakeReadyToScrape(params: {
  intakeId: Id<'bookIntake'>
  amazonUrl: string
}): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.action(api.bookIntake.worker.markReadyToScrape, {
    apiKey,
    ...params,
  })
}

/**
 * @deprecated Use claimQueueItem instead for safe concurrent processing.
 */
export async function markQueueItemProcessing(queueId: Id<'scrapeQueue'>): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.mutation(api.scrapeQueue.mutations.markProcessing, {
    apiKey,
    queueId,
  })
}

/**
 * Claim a queue item for processing with a lease.
 * Returns { success: true } if claimed, { success: false, reason } if not available.
 */
export async function claimQueueItem(queueId: Id<'scrapeQueue'>, workerId: string): Promise<{ success: boolean; reason?: string }> {
  const { client, apiKey } = getWorkerContext()
  return await client.mutation(api.scrapeQueue.mutations.claimItem, {
    apiKey,
    queueId,
    workerId,
  })
}

export async function markQueueItemComplete(params: {
  queueId: Id<'scrapeQueue'>
  bookId?: Id<'books'>
  seriesId?: Id<'series'>
  authorId?: Id<'authors'>
}): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.mutation(api.scrapeQueue.mutations.markComplete, {
    apiKey,
    ...params,
  })
}

export async function markQueueItemError(queueId: Id<'scrapeQueue'>, errorMessage: string): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.mutation(api.scrapeQueue.mutations.markError, {
    apiKey,
    queueId,
    errorMessage,
  })
}

export async function queueDiscoveries(
  discoveries: Array<{ type: 'book' | 'series' | 'author'; url: string; priority: number; source: string }>,
  referrerUrl?: string,
): Promise<number> {
  const { client, apiKey } = getWorkerContext()
  return await client.mutation(api.scrapeQueue.mutations.enqueueDiscoveries, {
    apiKey,
    discoveries,
    referrerUrl,
  })
}

/**
 * Re-queue a URL with a different type.
 * Removes the current item and enqueues a new one with the correct type.
 * Preserves provenance from the original item.
 */
export async function requeueAsType(params: {
  currentQueueId: Id<'scrapeQueue'>
  url: string
  newType: 'book' | 'series' | 'author'
  priority?: number
  referrerUrl?: string
  referrerReason?: string
}): Promise<void> {
  const { client, apiKey } = getWorkerContext()

  // Get the original item to preserve provenance
  const original = await client.query(workerApi.getQueueItem, {
    apiKey,
    queueId: params.currentQueueId,
  })

  // Remove the current item
  await client.mutation(api.scrapeQueue.mutations.remove, {
    apiKey,
    queueId: params.currentQueueId,
  })

  // Enqueue with the correct type, preserving provenance
  await client.mutation(api.scrapeQueue.mutations.enqueue, {
    apiKey,
    url: params.url,
    type: params.newType,
    priority: params.priority ?? 20, // Higher priority since we detected the correct type
    referrerUrl: params.referrerUrl ?? original?.referrerUrl,
    referrerReason: params.referrerReason ?? original?.referrerReason ?? 'type-correction',
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

export async function updateBookFromEnrichment(bookId: Id<'books'>, data: Record<string, any>, amazonUrl: string): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.books.mutations.updateFromEnrichment, {
    bookId,
    amazonUrl,
    subtitle: data.subtitle ?? undefined,
    asin: data.asin ?? undefined,
    publisher: data.publisher ?? undefined,
    publishedDate: data.publishedDate ?? undefined,
    pageCount: data.pageCount ?? undefined,
    description: data.description ?? undefined,
    coverImageUrl: data.coverImageUrl ?? undefined,
    lexileScore: data.lexileScore ?? undefined,
    ageRangeMin: data.ageRangeMin ?? undefined,
    ageRangeMax: data.ageRangeMax ?? undefined,
    ageRange: data.ageRangeRaw ?? data.ageRange ?? undefined,
    gradeLevelMin: data.gradeLevelMin ?? undefined,
    gradeLevelMax: data.gradeLevelMax ?? undefined,
    gradeLevel: data.gradeLevelRaw ?? data.gradeLevel ?? undefined,
    seriesName: data.seriesName ?? undefined,
    seriesUrl: data.seriesUrl ?? undefined,
    seriesPosition: data.seriesPosition ?? undefined,
  })
}

export async function markBookEnrichmentError(bookId: Id<'books'>, errorMessage: string): Promise<void> {
  const client = getConvexClient()
  await client.mutation(api.books.mutations.markEnrichmentError, { bookId, errorMessage })
}

// --- Series operations ---

export type SeriesToScrape = SeriesNeedingScrapeList[number]

export async function fetchSeriesNeedingScrape(limit: number = 3): Promise<SeriesToScrape[]> {
  const client = getConvexClient()
  const series = await client.query(api.series.queries.listNeedingScrape, { limit })
  return series as SeriesToScrape[]
}

export type SeriesNeedingUrl = SeriesNeedingUrlDiscoveryList[number]

export async function fetchSeriesNeedingUrlDiscovery(limit: number = 3): Promise<SeriesNeedingUrl[]> {
  const client = getConvexClient()
  const series = await client.query(api.series.queries.listNeedingUrlDiscovery, { limit })
  return series as SeriesNeedingUrl[]
}

export async function updateSeriesSourceUrl(seriesId: Id<'series'>, sourceUrl: string): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.mutation(workerApi.updateSeriesSourceUrl, {
    apiKey,
    seriesId,
    sourceUrl,
  })
}

export async function saveSeriesFromScrape(
  seriesId: Id<'series'>,
  data: {
    seriesName: string
    sourceUrl?: string
    description?: string
    coverImageUrl?: string
    expectedBookCount?: number
    discoveredBookCount?: number
    skipCoverDownload?: boolean
    scrapeVersion?: number
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
  },
): Promise<void> {
  const { client, apiKey } = getWorkerContext()
  await client.mutation(workerApi.saveSeriesFromScrape, {
    apiKey,
    seriesId,
    ...data,
  })
}

export async function upsertSeriesFromUrl(data: {
  name: string
  sourceUrl: string
  description?: string
  coverImageUrl?: string
  skipCoverDownload?: boolean
  firstSeenFromUrl?: string
  firstSeenReason?: string
}): Promise<Id<'series'>> {
  const { client, apiKey } = getWorkerContext()

  return await client.mutation(workerApi.upsertSeriesFromUrl, {
    apiKey,
    ...data,
  })
}

// --- Version upgrade operations ---

export type OutdatedEntity = {
  _id: Id<'books'> | Id<'series'> | Id<'authors'>
  name: string
  sourceUrl: string
  scrapeVersion: number | null
  type: 'book' | 'series' | 'author'
}

export async function fetchOutdatedSeries(currentVersion: number, limit: number = 3): Promise<OutdatedEntity[]> {
  const client = getConvexClient()
  const series = await client.query(api.series.queries.listOutdatedVersions, { currentVersion, limit })
  return series.map((s) => ({
    _id: s._id,
    name: s.name,
    sourceUrl: s.sourceUrl,
    scrapeVersion: s.scrapeVersion,
    type: 'series' as const,
  }))
}

export async function fetchOutdatedBooks(currentVersion: number, limit: number = 3): Promise<OutdatedEntity[]> {
  const client = getConvexClient()
  const books = await client.query(api.books.queries.listOutdatedVersions, { currentVersion, limit })
  return books.map((b) => ({
    _id: b._id,
    name: b.title,
    sourceUrl: b.amazonUrl,
    scrapeVersion: b.scrapeVersion,
    type: 'book' as const,
  }))
}

export async function fetchOutdatedAuthors(currentVersion: number, limit: number = 3): Promise<OutdatedEntity[]> {
  const client = getConvexClient()
  const authors = await client.query(api.authors.queries.listOutdatedVersions, { currentVersion, limit })
  return authors.map((a) => ({
    _id: a._id,
    name: a.name,
    sourceUrl: a.sourceUrl,
    scrapeVersion: a.scrapeVersion,
    type: 'author' as const,
  }))
}

export async function queueEntityForRescrape(
  entityType: 'book' | 'series' | 'author',
  entityId: Id<'books'> | Id<'series'> | Id<'authors'>,
): Promise<Id<'scrapeQueue'>> {
  const { client, apiKey } = getWorkerContext()
  return await client.mutation(api.scrapeQueue.mutations.queueRescrape, {
    apiKey,
    entityType,
    entityId,
  })
}

// --- Stats operations ---

export type EntityStats = FunctionReturnType<typeof workerApi.stats>

export async function fetchEntityStats(): Promise<EntityStats> {
  const { client, apiKey } = getWorkerContext()
  return await client.query(workerApi.stats, {
    apiKey,
  })
}

export function getScrapeImportKey() {
  const apiKey = process.env.SCRAPE_IMPORT_KEY
  if (!apiKey) {
    throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
  }

  return apiKey
}

function getWorkerContext() {
  return {
    client: getConvexClient(),
    apiKey: getScrapeImportKey(),
  }
}

// Re-export types
export type { Id } from '@/convex/_generated/dataModel'
