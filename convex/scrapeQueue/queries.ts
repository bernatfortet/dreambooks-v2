import { query } from '../_generated/server'
import { v } from 'convex/values'
import { requireSuperadmin } from '../lib/superadmin'

/**
 * Get pending items from the scrape queue, ordered by priority.
 */
export const listPending = query({
  args: {
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
    limit: v.optional(v.number()),
  },
  handler: async (context, args) => {
    await requireSuperadmin(context)

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
    queueId: v.id('scrapeQueue'),
  },
  handler: async (context, args) => {
    return await context.db.get(args.queueId)
  },
})

/**
 * Get queue stats.
 */
export const stats = query({
  handler: async (context) => {
    await requireSuperadmin(context)

    const all = await context.db.query('scrapeQueue').collect()

    const pending = all.filter((i) => i.status === 'pending').length
    const processing = all.filter((i) => i.status === 'processing').length
    const complete = all.filter((i) => i.status === 'complete').length
    const error = all.filter((i) => i.status === 'error').length

    return { pending, processing, complete, error, total: all.length }
  },
})
