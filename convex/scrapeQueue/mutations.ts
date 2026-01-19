import { mutation, internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { SCRAPING_CONFIG } from '../../lib/scraping/config'

const LEASE_DURATION_MS = SCRAPING_CONFIG.queue.leaseDurationMs

/**
 * Add a URL to the scrape queue.
 */
export const enqueue = mutation({
  args: {
    url: v.string(),
    type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    displayName: v.optional(v.string()),
    scrapeFullSeries: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    source: v.optional(v.union(v.literal('user'), v.literal('discovery'))),
  },
  returns: v.id('scrapeQueue'),
  handler: async (context, args) => {
    // Check if URL is already in queue (pending or processing)
    const existing = await context.db
      .query('scrapeQueue')
      .withIndex('by_url', (q) => q.eq('url', args.url))
      .filter((q) =>
        q.or(
          q.eq(q.field('status'), 'pending'),
          q.eq(q.field('status'), 'processing')
        )
      )
      .first()

    if (existing) {
      console.log('📋 URL already in queue', { url: args.url, status: existing.status })
      return existing._id
    }

    const queueId = await context.db.insert('scrapeQueue', {
      url: args.url,
      type: args.type,
      status: 'pending',
      priority: args.priority ?? 10,
      displayName: args.displayName,
      scrapeFullSeries: args.scrapeFullSeries ?? true,
      source: args.source ?? 'user',
      createdAt: Date.now(),
    })

    console.log('📋 Added to scrape queue', { url: args.url, type: args.type, queueId })

    return queueId
  },
})

/**
 * Mark a queue item as processing.
 * @deprecated Use claimItem instead for safe concurrent processing.
 */
export const markProcessing = mutation({
  args: {
    queueId: v.id('scrapeQueue'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.queueId, {
      status: 'processing',
      startedAt: Date.now(),
    })
    return null
  },
})

/**
 * Atomically claim a queue item for processing.
 * Returns success only if the item is available (pending or lease expired).
 * This prevents double-processing in multi-worker scenarios.
 */
export const claimItem = mutation({
  args: {
    queueId: v.id('scrapeQueue'),
    workerId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (context, args) => {
    const item = await context.db.get(args.queueId)
    if (!item) {
      return { success: false, reason: 'not_found' }
    }

    const now = Date.now()

    // Check if item is available:
    // - pending status, OR
    // - processing status with expired lease
    const isPending = item.status === 'pending'
    const hasExpiredLease =
      item.status === 'processing' &&
      item.leaseExpiresAt !== undefined &&
      item.leaseExpiresAt < now

    if (!isPending && !hasExpiredLease) {
      return { success: false, reason: 'already_claimed' }
    }

    // Claim the item with a lease
    await context.db.patch(args.queueId, {
      status: 'processing',
      workerId: args.workerId,
      leaseExpiresAt: now + LEASE_DURATION_MS,
      startedAt: now,
      attemptCount: (item.attemptCount ?? 0) + 1,
    })

    return { success: true }
  },
})

/**
 * Mark a queue item as complete.
 */
export const markComplete = mutation({
  args: {
    queueId: v.id('scrapeQueue'),
    bookId: v.optional(v.id('books')),
    seriesId: v.optional(v.id('series')),
    authorId: v.optional(v.id('authors')),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.queueId, {
      status: 'complete',
      bookId: args.bookId,
      seriesId: args.seriesId,
      authorId: args.authorId,
      completedAt: Date.now(),
    })
    return null
  },
})

/**
 * Mark a queue item as error.
 */
export const markError = mutation({
  args: {
    queueId: v.id('scrapeQueue'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.queueId, {
      status: 'error',
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    })
    return null
  },
})

/**
 * Remove a single item from the queue.
 */
export const remove = mutation({
  args: {
    queueId: v.id('scrapeQueue'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const item = await context.db.get(args.queueId)
    if (!item) return null

    await context.db.delete(args.queueId)
    console.log('📋 Removed from scrape queue', { url: item.url, queueId: args.queueId })

    return null
  },
})

/**
 * Enqueue multiple discoveries at once.
 * Handles deduplication and applies queue safeguards.
 */
export const enqueueDiscoveries = mutation({
  args: {
    discoveries: v.array(
      v.object({
        type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
        url: v.string(),
        priority: v.number(),
        source: v.string(), // Discovery source description (e.g., 'book-series-link')
        metadata: v.optional(
          v.object({
            name: v.optional(v.string()),
            position: v.optional(v.number()),
          })
        ),
      })
    ),
  },
  returns: v.number(), // Number of items actually queued
  handler: async (context, args) => {
    let queued = 0
    const maxDiscoveries = SCRAPING_CONFIG.queue.maxDiscoveriesPerCall

    // Cap discoveries to prevent queue floods
    const cappedDiscoveries = args.discoveries.slice(0, maxDiscoveries)

    for (const discovery of cappedDiscoveries) {
      // Check if URL is already in queue (pending or processing)
      const existing = await context.db
        .query('scrapeQueue')
        .withIndex('by_url', (q) => q.eq('url', discovery.url))
        .filter((q) =>
          q.or(
            q.eq(q.field('status'), 'pending'),
            q.eq(q.field('status'), 'processing')
          )
        )
        .first()

      if (existing) {
        continue // Skip duplicates
      }

      await context.db.insert('scrapeQueue', {
        url: discovery.url,
        type: discovery.type,
        status: 'pending',
        priority: discovery.priority,
        displayName: discovery.metadata?.name,
        scrapeFullSeries: true, // Default to true for discoveries
        source: 'discovery',
        createdAt: Date.now(),
      })

      queued++
    }

    console.log(`📋 Queued ${queued} discoveries (${cappedDiscoveries.length} provided, ${args.discoveries.length - cappedDiscoveries.length} capped)`)

    return queued
  },
})

/**
 * Clear completed/errored items older than a certain age.
 */
export const clearOld = mutation({
  args: {
    maxAgeMs: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (context, args) => {
    const maxAge = args.maxAgeMs ?? 24 * 60 * 60 * 1000 // 24 hours default
    const cutoff = Date.now() - maxAge

    const oldItems = await context.db
      .query('scrapeQueue')
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field('status'), 'complete'),
            q.eq(q.field('status'), 'error')
          ),
          q.lt(q.field('createdAt'), cutoff)
        )
      )
      .collect()

    for (const item of oldItems) {
      await context.db.delete(item._id)
    }

    return oldItems.length
  },
})

/**
 * Recover items with expired leases by setting them back to pending.
 * Called by cron job to handle workers that crashed or timed out.
 */
export const recoverExpiredLeases = internalMutation({
  returns: v.number(),
  handler: async (context) => {
    const now = Date.now()

    // Find all processing items with expired leases
    const expiredItems = await context.db
      .query('scrapeQueue')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .filter((q) =>
        q.and(
          q.neq(q.field('leaseExpiresAt'), undefined),
          q.lt(q.field('leaseExpiresAt'), now)
        )
      )
      .collect()

    // Reset each expired item to pending
    for (const item of expiredItems) {
      await context.db.patch(item._id, {
        status: 'pending',
        workerId: undefined,
        leaseExpiresAt: undefined,
      })

      console.log('🔄 Recovered expired lease', { url: item.url, attemptCount: item.attemptCount })
    }

    if (expiredItems.length > 0) {
      console.log(`🔄 Recovered ${expiredItems.length} expired lease(s)`)
    }

    return expiredItems.length
  },
})
