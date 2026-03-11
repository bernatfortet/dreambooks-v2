import { query } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import { v } from 'convex/values'
import { readSystemStatsWithFallback } from '../lib/systemStats'
import { requireScrapeImportKey } from '../lib/scrapeImportAuth'
import { requireSuperadmin } from '../lib/superadmin'

async function requireQueueReadAccess(context: QueryCtx, apiKey: string | undefined) {
  if (apiKey) {
    requireScrapeImportKey(apiKey)
    return
  }

  await requireSuperadmin(context)
}

/**
 * Get pending items from the scrape queue, ordered by priority.
 */
export const listPending = query({
  args: {
    apiKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('scrapeQueue'),
      url: v.string(),
      type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
      scrapeFullSeries: v.boolean(),
      priority: v.number(),
      source: v.union(v.literal('user'), v.literal('discovery')),
      referrerUrl: v.optional(v.string()),
      referrerReason: v.optional(v.string()),
      createdAt: v.number(),
      // Re-scrape skip options
      skipSeriesLink: v.optional(v.boolean()),
      skipAuthorDiscovery: v.optional(v.boolean()),
      skipBookDiscoveries: v.optional(v.boolean()),
      skipCoverDownload: v.optional(v.boolean()),
      bookId: v.optional(v.id('books')),
    }),
  ),
  handler: async (context, args) => {
    await requireQueueReadAccess(context, args.apiKey)

    const limit = args.limit ?? 10

    const items = await context.db
      .query('scrapeQueue')
      .withIndex('by_status_priority', (q) => q.eq('status', 'pending'))
      .take(limit)

    return items.map((item) => ({
      _id: item._id,
      url: item.url,
      type: item.type,
      scrapeFullSeries: item.scrapeFullSeries,
      priority: item.priority,
      source: (item.source ?? 'user') as 'user' | 'discovery',
      referrerUrl: item.referrerUrl,
      referrerReason: item.referrerReason,
      createdAt: item.createdAt,
      // Re-scrape skip options
      skipSeriesLink: item.skipSeriesLink,
      skipAuthorDiscovery: item.skipAuthorDiscovery,
      skipBookDiscoveries: item.skipBookDiscoveries,
      skipCoverDownload: item.skipCoverDownload,
      bookId: item.bookId,
    }))
  },
})

/**
 * Get all queue items for display (recent first).
 */
export const list = query({
  args: {
    apiKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (context, args) => {
    await requireQueueReadAccess(context, args.apiKey)

    const limit = args.limit ?? 50

    const items = await context.db.query('scrapeQueue').order('desc').take(limit)

    return items
  },
})

/**
 * Get a single queue item by ID.
 */
export const get = query({
  args: {
    apiKey: v.optional(v.string()),
    queueId: v.id('scrapeQueue'),
  },
  handler: async (context, args) => {
    await requireQueueReadAccess(context, args.apiKey)

    return await context.db.get(args.queueId)
  },
})

/**
 * Get queue stats.
 */
export const stats = query({
  handler: async (context) => {
    await requireSuperadmin(context)
    return (await readSystemStatsWithFallback(context.db)).scrapeQueue
  },
})
