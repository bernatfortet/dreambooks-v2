import { internalMutation } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import { v } from 'convex/values'
import { applyDelta, BookIntakeStatus, buildEmptySystemStats, countBookIntakeStatuses, countScrapeQueueStatuses, getStoredSystemStats } from '../lib/systemStats'

export const rebuild = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (context) => {
    const snapshot = await buildSnapshot(context)
    const existingStats = await getStoredSystemStats(context.db)

    if (existingStats) {
      await context.db.patch(existingStats._id, snapshot)
      return null
    }

    await context.db.insert('systemStats', snapshot)
    return null
  },
})

export const adjustEntityCount = internalMutation({
  args: {
    entityType: v.union(v.literal('books'), v.literal('series'), v.literal('authors')),
    delta: v.number(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const statsDocument = await getOrCreateStatsDocument(context)
    const entityCounts = {
      ...statsDocument.entityCounts,
      [args.entityType]: applyDelta(statsDocument.entityCounts[args.entityType], args.delta),
    }

    await context.db.patch(statsDocument._id, {
      entityCounts,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const adjustScrapeQueueStatus = internalMutation({
  args: {
    previousStatus: v.optional(v.union(v.literal('pending'), v.literal('processing'), v.literal('complete'), v.literal('error'))),
    nextStatus: v.optional(v.union(v.literal('pending'), v.literal('processing'), v.literal('complete'), v.literal('error'))),
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    if (args.previousStatus === args.nextStatus) return null

    const statsDocument = await getOrCreateStatsDocument(context)
    const count = Math.max(1, args.count ?? 1)
    const scrapeQueue = { ...statsDocument.scrapeQueue }

    if (args.previousStatus) {
      scrapeQueue[args.previousStatus] = applyDelta(scrapeQueue[args.previousStatus], -count)
      scrapeQueue.total = applyDelta(scrapeQueue.total, -count)
    }

    if (args.nextStatus) {
      scrapeQueue[args.nextStatus] = applyDelta(scrapeQueue[args.nextStatus], count)
      scrapeQueue.total += count
    }

    await context.db.patch(statsDocument._id, {
      scrapeQueue,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const adjustBookIntakeStatus = internalMutation({
  args: {
    previousStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('researching'),
        v.literal('ready_to_scrape'),
        v.literal('waiting_for_scrape'),
        v.literal('linked'),
        v.literal('needs_review'),
        v.literal('failed'),
      ),
    ),
    nextStatus: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('researching'),
        v.literal('ready_to_scrape'),
        v.literal('waiting_for_scrape'),
        v.literal('linked'),
        v.literal('needs_review'),
        v.literal('failed'),
      ),
    ),
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    if (args.previousStatus === args.nextStatus) return null

    const statsDocument = await getOrCreateStatsDocument(context)
    const count = Math.max(1, args.count ?? 1)
    const bookIntake = { ...statsDocument.bookIntake }

    if (args.previousStatus) {
      decrementBookIntakeCount(bookIntake, args.previousStatus, count)
      bookIntake.total = applyDelta(bookIntake.total, -count)
    }

    if (args.nextStatus) {
      incrementBookIntakeCount(bookIntake, args.nextStatus, count)
      bookIntake.total += count
    }

    await context.db.patch(statsDocument._id, {
      bookIntake,
      updatedAt: Date.now(),
    })

    return null
  },
})

async function getOrCreateStatsDocument(context: MutationCtx) {
  const existingStats = await getStoredSystemStats(context.db)
  if (existingStats) return existingStats

  const snapshot = await buildSnapshot(context)
  const statsId = await context.db.insert('systemStats', snapshot)
  const createdStats = await context.db.get(statsId)
  if (!createdStats) throw new Error('Failed to create system stats document')

  return createdStats
}

async function buildSnapshot(context: MutationCtx) {
  const [books, series, authors, scrapeQueueItems, intakeItems] = await Promise.all([
    context.db.query('books').collect(),
    context.db.query('series').collect(),
    context.db.query('authors').collect(),
    context.db.query('scrapeQueue').collect(),
    context.db.query('bookIntake').collect(),
  ])

  const now = Date.now()
  const emptyStats = buildEmptySystemStats(now)

  return {
    ...emptyStats,
    entityCounts: {
      books: books.length,
      series: series.length,
      authors: authors.length,
    },
    scrapeQueue: countScrapeQueueStatuses(scrapeQueueItems),
    bookIntake: countBookIntakeStatuses(intakeItems),
    updatedAt: now,
  }
}

function incrementBookIntakeCount(counts: ReturnType<typeof countBookIntakeStatuses>, status: BookIntakeStatus, count: number) {
  if (status === 'pending') counts.pending += count
  if (status === 'researching') counts.researching += count
  if (status === 'ready_to_scrape') counts.readyToScrape += count
  if (status === 'waiting_for_scrape') counts.waitingForScrape += count
  if (status === 'linked') counts.linked += count
  if (status === 'needs_review') counts.needsReview += count
  if (status === 'failed') counts.failed += count
}

function decrementBookIntakeCount(counts: ReturnType<typeof countBookIntakeStatuses>, status: BookIntakeStatus, count: number) {
  if (status === 'pending') counts.pending = applyDelta(counts.pending, -count)
  if (status === 'researching') counts.researching = applyDelta(counts.researching, -count)
  if (status === 'ready_to_scrape') counts.readyToScrape = applyDelta(counts.readyToScrape, -count)
  if (status === 'waiting_for_scrape') counts.waitingForScrape = applyDelta(counts.waitingForScrape, -count)
  if (status === 'linked') counts.linked = applyDelta(counts.linked, -count)
  if (status === 'needs_review') counts.needsReview = applyDelta(counts.needsReview, -count)
  if (status === 'failed') counts.failed = applyDelta(counts.failed, -count)
}
