import { query } from '../_generated/server'
import { v } from 'convex/values'
import type { QueryCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { requireSuperadmin } from '../lib/superadmin'

type IntakeStatus = Doc<'bookIntake'>['status']

const DEFAULT_QUEUE_LIMIT = 100
const DEFAULT_REVIEW_LIMIT = 50
const MAX_QUEUE_LIMIT = 100

const allIntakeStatuses: IntakeStatus[] = [
  'pending',
  'researching',
  'ready_to_scrape',
  'waiting_for_scrape',
  'linked',
  'needs_review',
  'failed',
]

const intakeStatusValidator = v.union(
  v.literal('pending'),
  v.literal('researching'),
  v.literal('ready_to_scrape'),
  v.literal('waiting_for_scrape'),
  v.literal('linked'),
  v.literal('needs_review'),
  v.literal('failed'),
)

export const stats = query({
  returns: v.object({
    pending: v.number(),
    researching: v.number(),
    readyToScrape: v.number(),
    waitingForScrape: v.number(),
    linked: v.number(),
    needsReview: v.number(),
    failed: v.number(),
    total: v.number(),
  }),
  handler: async (context) => {
    await requireSuperadmin(context)

    const items = await context.db.query('bookIntake').collect()
    const counts = countStatuses(items)
    return counts
  },
})

export const listQueue = query({
  args: {
    statuses: v.optional(v.array(intakeStatusValidator)),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('bookIntake'),
      title: v.string(),
      authorName: v.union(v.string(), v.null()),
      illustratorName: v.union(v.string(), v.null()),
      status: intakeStatusValidator,
      sourceType: v.union(v.literal('manual'), v.literal('award'), v.literal('list')),
      sourceLabel: v.union(v.string(), v.null()),
      sourcePath: v.union(v.string(), v.null()),
      sourcePage: v.union(v.number(), v.null()),
      rawText: v.union(v.string(), v.null()),
      searchQuery: v.string(),
      attemptCount: v.number(),
      lastError: v.union(v.string(), v.null()),
      needsReviewReason: v.union(v.string(), v.null()),
      matchedAsin: v.union(v.string(), v.null()),
      matchedAmazonUrl: v.union(v.string(), v.null()),
      candidateSnapshotJson: v.union(v.string(), v.null()),
      scrapeQueueId: v.union(v.id('scrapeQueue'), v.null()),
      linkedAwardName: v.union(v.string(), v.null()),
      linkedAwardYear: v.union(v.number(), v.null()),
      linkedAwardCategory: v.union(v.string(), v.null()),
      matchedBook: v.union(
        v.object({
          _id: v.id('books'),
          title: v.string(),
          slug: v.union(v.string(), v.null()),
        }),
        v.null(),
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
      resolvedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (context, args) => {
    await requireSuperadmin(context)

    const selectedStatuses = getSelectedStatuses(args.statuses)
    const limit = resolveLimit(args.limit, DEFAULT_QUEUE_LIMIT)
    const items = await loadQueueItems(context, {
      selectedStatuses,
      limit,
    })
    const filteredItems = items
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, limit)

    const queueItems = await Promise.all(filteredItems.map((item) => buildQueueItem(context, item)))
    return queueItems
  },
})

export const listNeedsReview = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('bookIntake'),
      title: v.string(),
      authorName: v.union(v.string(), v.null()),
      illustratorName: v.union(v.string(), v.null()),
      needsReviewReason: v.union(v.string(), v.null()),
      candidateSnapshotJson: v.union(v.string(), v.null()),
      matchedAmazonUrl: v.union(v.string(), v.null()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (context, args) => {
    await requireSuperadmin(context)

    const limit = resolveLimit(args.limit, DEFAULT_REVIEW_LIMIT)
    const items = await loadItemsByStatus(context, {
      status: 'needs_review',
      limit,
    })

    return items
      .map((item) => ({
        _id: item._id,
        title: item.title,
        authorName: item.authorName ?? null,
        illustratorName: item.illustratorName ?? null,
        needsReviewReason: item.needsReviewReason ?? null,
        candidateSnapshotJson: item.candidateSnapshotJson ?? null,
        matchedAmazonUrl: item.matchedAmazonUrl ?? null,
        updatedAt: item.updatedAt,
      }))
  },
})

function countStatuses(items: Array<{ status: IntakeStatus }>) {
  const counts = {
    pending: 0,
    researching: 0,
    readyToScrape: 0,
    waitingForScrape: 0,
    linked: 0,
    needsReview: 0,
    failed: 0,
    total: items.length,
  }

  for (const item of items) {
    if (item.status === 'pending') counts.pending += 1
    if (item.status === 'researching') counts.researching += 1
    if (item.status === 'ready_to_scrape') counts.readyToScrape += 1
    if (item.status === 'waiting_for_scrape') counts.waitingForScrape += 1
    if (item.status === 'linked') counts.linked += 1
    if (item.status === 'needs_review') counts.needsReview += 1
    if (item.status === 'failed') counts.failed += 1
  }

  return counts
}

async function loadQueueItems(
  context: QueryCtx,
  params: {
    selectedStatuses: IntakeStatus[]
    limit: number
  },
) {
  const groupedItems = await Promise.all(
    params.selectedStatuses.map(async (status) => {
      return await loadItemsByStatus(context, {
        status,
        limit: params.limit,
      })
    }),
  )

  return groupedItems.flat()
}

function getSelectedStatuses(statuses: IntakeStatus[] | undefined) {
  if (!statuses?.length) return allIntakeStatuses
  return statuses
}

function resolveLimit(value: number | undefined, defaultLimit: number) {
  return Math.min(value ?? defaultLimit, MAX_QUEUE_LIMIT)
}

async function loadItemsByStatus(
  context: QueryCtx,
  params: {
    status: IntakeStatus
    limit: number
  },
) {
  return await context.db
    .query('bookIntake')
    .withIndex('by_status_updatedAt', (query) => query.eq('status', params.status))
    .order('desc')
    .take(params.limit)
}

async function buildQueueItem(
  context: QueryCtx,
  item: Doc<'bookIntake'>,
) {
  const matchedBook = item.matchedBookId ? await context.db.get(item.matchedBookId) : null

  return {
    _id: item._id,
    title: item.title,
    authorName: item.authorName ?? null,
    illustratorName: item.illustratorName ?? null,
    status: item.status,
    sourceType: item.sourceType,
    sourceLabel: item.sourceLabel ?? null,
    sourcePath: item.sourcePath ?? null,
    sourcePage: item.sourcePage ?? null,
    rawText: item.rawText ?? null,
    searchQuery: item.searchQuery,
    attemptCount: item.attemptCount,
    lastError: item.lastError ?? null,
    needsReviewReason: item.needsReviewReason ?? null,
    matchedAsin: item.matchedAsin ?? null,
    matchedAmazonUrl: item.matchedAmazonUrl ?? null,
    candidateSnapshotJson: item.candidateSnapshotJson ?? null,
    scrapeQueueId: item.scrapeQueueId ?? null,
    linkedAwardName: item.linkedAwardName ?? null,
    linkedAwardYear: item.linkedAwardYear ?? null,
    linkedAwardCategory: item.linkedAwardCategory ?? null,
    matchedBook: matchedBook
      ? {
          _id: matchedBook._id,
          title: matchedBook.title,
          slug: matchedBook.slug ?? null,
        }
      : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    resolvedAt: item.resolvedAt ?? null,
  }
}
