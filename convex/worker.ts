import { mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { v } from 'convex/values'
import { requireScrapeImportKey } from './lib/scrapeImportAuth'
import { readSystemStatsWithFallback } from './lib/systemStats'

const queueItemValidator = v.object({
  _id: v.id('scrapeQueue'),
  url: v.string(),
  type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
  scrapeFullSeries: v.boolean(),
  priority: v.number(),
  source: v.union(v.literal('user'), v.literal('discovery')),
  referrerUrl: v.optional(v.string()),
  referrerReason: v.optional(v.string()),
  createdAt: v.number(),
  skipSeriesLink: v.optional(v.boolean()),
  skipAuthorDiscovery: v.optional(v.boolean()),
  skipBookDiscoveries: v.optional(v.boolean()),
  skipCoverDownload: v.optional(v.boolean()),
  bookId: v.optional(v.id('books')),
})

const queueHistoryItemValidator = v.object({
  _id: v.id('scrapeQueue'),
  url: v.string(),
  status: v.union(v.literal('pending'), v.literal('processing'), v.literal('complete'), v.literal('error')),
  referrerReason: v.optional(v.string()),
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
})

const queueItemDetailsValidator = v.object({
  _id: v.id('scrapeQueue'),
  url: v.string(),
  referrerUrl: v.optional(v.string()),
  referrerReason: v.optional(v.string()),
})

const seriesScrapeSaveResultValidator = v.object({
  booksFound: v.number(),
  pending: v.number(),
  skipped: v.number(),
  hasMorePages: v.boolean(),
})

type WorkerStats = {
  books: number
  series: number
  authors: number
}

type WorkerQueueItem = {
  _id: Id<'scrapeQueue'>
  url: string
  type: 'book' | 'series' | 'author'
  scrapeFullSeries: boolean
  priority: number
  source: 'user' | 'discovery'
  referrerUrl?: string
  referrerReason?: string
  createdAt: number
  skipSeriesLink?: boolean
  skipAuthorDiscovery?: boolean
  skipBookDiscoveries?: boolean
  skipCoverDownload?: boolean
  bookId?: Id<'books'>
}

type WorkerQueueHistoryItem = {
  _id: Id<'scrapeQueue'>
  url: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  referrerReason?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  errorMessage?: string
}

type WorkerQueueItemDetails = {
  _id: Id<'scrapeQueue'>
  url: string
  referrerUrl?: string
  referrerReason?: string
}

type WorkerSeriesScrapeSaveResult = {
  booksFound: number
  pending: number
  skipped: number
  hasMorePages: boolean
}

export const stats = query({
  args: {
    apiKey: v.string(),
  },
  returns: v.object({
    books: v.number(),
    series: v.number(),
    authors: v.number(),
  }),
  handler: async (context, args): Promise<WorkerStats> => {
    requireWorkerAccess(args.apiKey)
    const stats = await readSystemStatsWithFallback(context.db)

    return {
      books: stats.entityCounts.books,
      series: stats.entityCounts.series,
      authors: stats.entityCounts.authors,
    }
  },
})

export const listPendingQueueItems = query({
  args: {
    apiKey: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(queueItemValidator),
  handler: async (context, args): Promise<WorkerQueueItem[]> => {
    requireWorkerAccess(args.apiKey)

    const limit = args.limit ?? 10

    const items: Doc<'scrapeQueue'>[] = await context.db
      .query('scrapeQueue')
      .withIndex('by_status_priority', (query) => query.eq('status', 'pending'))
      .take(limit)

    return items.map(toWorkerQueueItem)
  },
})

export const listRecentQueueItems = query({
  args: {
    apiKey: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(queueHistoryItemValidator),
  handler: async (context, args): Promise<WorkerQueueHistoryItem[]> => {
    requireWorkerAccess(args.apiKey)

    const limit = args.limit ?? 50

    const items: Doc<'scrapeQueue'>[] = await context.db.query('scrapeQueue').order('desc').take(limit)

    return items.map(toWorkerQueueHistoryItem)
  },
})

export const getQueueItem = query({
  args: {
    apiKey: v.string(),
    queueId: v.id('scrapeQueue'),
  },
  returns: v.union(queueItemDetailsValidator, v.null()),
  handler: async (context, args): Promise<WorkerQueueItemDetails | null> => {
    requireWorkerAccess(args.apiKey)

    const item: Doc<'scrapeQueue'> | null = await context.db.get(args.queueId)

    if (!item) return null

    return toWorkerQueueItemDetails(item)
  },
})

export const upsertSeriesFromUrl = mutation({
  args: {
    apiKey: v.string(),
    name: v.string(),
    sourceUrl: v.string(),
    description: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    skipCoverDownload: v.optional(v.boolean()),
    firstSeenFromUrl: v.optional(v.string()),
    firstSeenReason: v.optional(v.string()),
  },
  returns: v.id('series'),
  handler: async (context, args): Promise<Id<'series'>> => {
    requireWorkerAccess(args.apiKey)

    return await context.runMutation(internal.series.mutations.workerUpsertFromUrl, {
      name: args.name,
      sourceUrl: args.sourceUrl,
      description: args.description,
      coverImageUrl: args.coverImageUrl,
      skipCoverDownload: args.skipCoverDownload,
      firstSeenFromUrl: args.firstSeenFromUrl,
      firstSeenReason: args.firstSeenReason,
    })
  },
})

export const updateSeriesSourceUrl = mutation({
  args: {
    apiKey: v.string(),
    seriesId: v.id('series'),
    sourceUrl: v.string(),
  },
  returns: v.null(),
  handler: async (context, args): Promise<null> => {
    requireWorkerAccess(args.apiKey)

    return await context.runMutation(internal.series.mutations.workerUpdateSourceUrl, {
      seriesId: args.seriesId,
      sourceUrl: args.sourceUrl,
    })
  },
})

export const saveSeriesFromScrape = mutation({
  args: {
    apiKey: v.string(),
    seriesId: v.id('series'),
    seriesName: v.string(),
    sourceUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    expectedBookCount: v.optional(v.number()),
    discoveredBookCount: v.optional(v.number()),
    skipCoverDownload: v.optional(v.boolean()),
    scrapeVersion: v.optional(v.number()),
    books: v.array(
      v.object({
        title: v.string(),
        amazonUrl: v.string(),
        asin: v.optional(v.string()),
        position: v.optional(v.number()),
        coverImageUrl: v.optional(v.string()),
        authors: v.optional(v.array(v.string())),
      }),
    ),
    pagination: v.optional(
      v.object({
        currentPage: v.number(),
        totalPages: v.optional(v.number()),
        nextPageUrl: v.optional(v.string()),
      }),
    ),
  },
  returns: seriesScrapeSaveResultValidator,
  handler: async (context, args): Promise<WorkerSeriesScrapeSaveResult> => {
    requireWorkerAccess(args.apiKey)

    return await context.runMutation(internal.series.mutations.workerSaveFromCliScrape, {
      seriesId: args.seriesId,
      seriesName: args.seriesName,
      sourceUrl: args.sourceUrl,
      description: args.description,
      coverImageUrl: args.coverImageUrl,
      expectedBookCount: args.expectedBookCount,
      discoveredBookCount: args.discoveredBookCount,
      skipCoverDownload: args.skipCoverDownload,
      scrapeVersion: args.scrapeVersion,
      books: args.books,
      pagination: args.pagination,
    })
  },
})

function requireWorkerAccess(apiKey: string) {
  requireScrapeImportKey(apiKey)
}

function toWorkerQueueItem(item: Doc<'scrapeQueue'>): WorkerQueueItem {
  return {
    _id: item._id,
    url: item.url,
    type: item.type,
    scrapeFullSeries: item.scrapeFullSeries,
    priority: item.priority,
    source: normalizeQueueItemSource(item.source),
    referrerUrl: item.referrerUrl,
    referrerReason: item.referrerReason,
    createdAt: item.createdAt,
    skipSeriesLink: item.skipSeriesLink,
    skipAuthorDiscovery: item.skipAuthorDiscovery,
    skipBookDiscoveries: item.skipBookDiscoveries,
    skipCoverDownload: item.skipCoverDownload,
    bookId: item.bookId,
  }
}

function toWorkerQueueHistoryItem(item: Doc<'scrapeQueue'>): WorkerQueueHistoryItem {
  return {
    _id: item._id,
    url: item.url,
    status: item.status,
    referrerReason: item.referrerReason,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    errorMessage: item.errorMessage,
  }
}

function toWorkerQueueItemDetails(item: Doc<'scrapeQueue'>): WorkerQueueItemDetails {
  return {
    _id: item._id,
    url: item.url,
    referrerUrl: item.referrerUrl,
    referrerReason: item.referrerReason,
  }
}

function normalizeQueueItemSource(source: Doc<'scrapeQueue'>['source']): WorkerQueueItem['source'] {
  return source === 'discovery' ? 'discovery' : 'user'
}
