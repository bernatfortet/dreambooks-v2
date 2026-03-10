import { internalMutation, mutation } from '../_generated/server'
import { v } from 'convex/values'
import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { requireSuperadmin } from '../lib/superadmin'
import { internal } from '../_generated/api'
import { extractAsin, normalizeAmazonUrl } from '@/lib/scraping/utils/amazon-url'
import { createAwardEntryKey, normalizeNameForComparison, normalizeTitleForComparison } from '@/lib/awards/import/normalize'

const BOOK_INTAKE_LEASE_DURATION_MS = 10 * 60 * 1000

const awardResultTypeValidator = v.union(
  v.literal('winner'),
  v.literal('honor'),
  v.literal('finalist'),
  v.literal('other'),
)

const claimedItemValidator = v.object({
  _id: v.id('bookIntake'),
  title: v.string(),
  authorName: v.union(v.string(), v.null()),
  illustratorName: v.union(v.string(), v.null()),
  searchQuery: v.string(),
  sourceType: v.union(v.literal('manual'), v.literal('award'), v.literal('list')),
  sourceLabel: v.union(v.string(), v.null()),
  sourcePath: v.union(v.string(), v.null()),
  sourcePage: v.union(v.number(), v.null()),
  rawText: v.union(v.string(), v.null()),
  sourceMetadataJson: v.union(v.string(), v.null()),
  linkedAwardName: v.union(v.string(), v.null()),
  linkedAwardYear: v.union(v.number(), v.null()),
  linkedAwardCategory: v.union(v.string(), v.null()),
  linkedAwardResultType: v.union(awardResultTypeValidator, v.null()),
})

export const enqueueManual = mutation({
  args: {
    title: v.string(),
    authorName: v.optional(v.string()),
    illustratorName: v.optional(v.string()),
    sourceLabel: v.optional(v.string()),
    rawText: v.optional(v.string()),
  },
  returns: v.object({
    intakeId: v.id('bookIntake'),
    created: v.boolean(),
  }),
  handler: async (context, args) => {
    await requireSuperadmin(context)

    const sourceKey = buildManualSourceKey(args)
    const existing = await findBySourceKey(context, sourceKey)
    if (existing) {
      return {
        intakeId: existing._id,
        created: false,
      }
    }

    const intakeId = await context.db.insert(
      'bookIntake',
      createManualIntakeDocument({
        sourceKey,
        title: args.title,
        authorName: args.authorName,
        illustratorName: args.illustratorName,
        sourceLabel: args.sourceLabel,
        rawText: args.rawText,
      }),
    )

    return {
      intakeId,
      created: true,
    }
  },
})

export const enqueueManyFromAwardRows = mutation({
  args: {
    entries: v.array(
      v.object({
        awardName: v.string(),
        year: v.number(),
        resultType: awardResultTypeValidator,
        categoryLabel: v.string(),
        title: v.string(),
        author: v.optional(v.string()),
        illustrator: v.optional(v.string()),
        sourceName: v.string(),
        sourcePath: v.string(),
        sourcePage: v.optional(v.number()),
        rawText: v.string(),
      }),
    ),
  },
  returns: v.object({
    created: v.number(),
    skipped: v.number(),
    intakeIds: v.array(v.id('bookIntake')),
  }),
  handler: async (context, args) => {
    const intakeIds: Id<'bookIntake'>[] = []
    let created = 0
    let skipped = 0

    for (const entry of args.entries) {
      const sourceKey = createAwardEntryKey({
        awardName: entry.awardName,
        year: entry.year,
        resultType: entry.resultType,
        categoryLabel: entry.categoryLabel,
        title: entry.title,
        author: entry.author,
        illustrator: entry.illustrator,
        sourceName: entry.sourceName,
        sourcePath: entry.sourcePath,
        sourcePage: entry.sourcePage,
        rawText: entry.rawText,
      })
      const existing = await findBySourceKey(context, sourceKey)
      if (existing) {
        intakeIds.push(existing._id)
        skipped += 1
        continue
      }

      const intakeId = await context.db.insert('bookIntake', createAwardIntakeDocument({ entry, sourceKey }))

      intakeIds.push(intakeId)
      created += 1
    }

    return {
      created,
      skipped,
      intakeIds,
    }
  },
})

export const claimNextPending = mutation({
  args: {
    workerId: v.string(),
  },
  returns: v.union(claimedItemValidator, v.null()),
  handler: async (context, args) => {
    const intakeItem = await findClaimableIntakeItem(context)
    if (!intakeItem) return null

    const now = Date.now()
    await context.db.patch(intakeItem._id, {
      status: 'researching',
      workerId: args.workerId,
      leaseExpiresAt: now + BOOK_INTAKE_LEASE_DURATION_MS,
      attemptCount: intakeItem.attemptCount + 1,
      lastAttemptAt: now,
      updatedAt: now,
    })

    return toClaimedItem(intakeItem)
  },
})

export const markNeedsReview = mutation({
  args: {
    intakeId: v.id('bookIntake'),
    reason: v.optional(v.string()),
    candidateSnapshotJson: v.optional(v.string()),
    matchedAsin: v.optional(v.string()),
    matchedAmazonUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const intakeItem = await context.db.get(args.intakeId)
    if (!intakeItem) return null

    await context.db.patch(args.intakeId, {
      status: 'needs_review',
      needsReviewReason: trimOptional(args.reason),
      candidateSnapshotJson: args.candidateSnapshotJson,
      matchedAsin: trimOptional(args.matchedAsin),
      matchedAmazonUrl: trimOptional(args.matchedAmazonUrl),
      ...clearWorkerLeaseFields(),
      updatedAt: Date.now(),
    })

    return null
  },
})

export const markFailed = mutation({
  args: {
    intakeId: v.id('bookIntake'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const intakeItem = await context.db.get(args.intakeId)
    if (!intakeItem) return null

    await context.db.patch(args.intakeId, {
      status: 'failed',
      lastError: args.errorMessage,
      ...clearWorkerLeaseFields(),
      updatedAt: Date.now(),
    })

    return null
  },
})

export const retry = mutation({
  args: {
    intakeId: v.id('bookIntake'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await requireSuperadmin(context)

    const intakeItem = await context.db.get(args.intakeId)
    if (!intakeItem) return null

    await context.db.patch(args.intakeId, {
      status: 'pending',
      lastError: undefined,
      needsReviewReason: undefined,
      candidateSnapshotJson: undefined,
      ...clearWorkerLeaseFields(),
      updatedAt: Date.now(),
    })

    return null
  },
})

export const markResolvedExisting = mutation({
  args: {
    intakeId: v.id('bookIntake'),
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const intakeItem = await context.db.get(args.intakeId)
    if (!intakeItem) return null

    await finalizeLinkedBook(context, {
      intakeItem,
      bookId: args.bookId,
    })

    return null
  },
})

export const markReadyToScrape = mutation({
  args: {
    intakeId: v.id('bookIntake'),
    amazonUrl: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const intakeItem = await context.db.get(args.intakeId)
    if (!intakeItem) return null

    const cleanedUrl = cleanAmazonUrl(args.amazonUrl)
    const matchedAsin = extractAsin(cleanedUrl) ?? undefined

    const existingQueueItem = await context.db
      .query('scrapeQueue')
      .withIndex('by_url', (query) => query.eq('url', cleanedUrl))
      .filter((query) =>
        query.or(
          query.eq(query.field('status'), 'pending'),
          query.eq(query.field('status'), 'processing'),
          query.eq(query.field('status'), 'complete'),
        ),
      )
      .first()

    if (existingQueueItem?.status === 'complete' && existingQueueItem.bookId) {
      await finalizeLinkedBook(context, {
        intakeItem,
        bookId: existingQueueItem.bookId,
        matchedAsin,
        matchedAmazonUrl: cleanedUrl,
        scrapeQueueId: existingQueueItem._id,
      })
      return null
    }

    let scrapeQueueId = existingQueueItem?._id

    if (existingQueueItem && !existingQueueItem.bookIntakeId) {
      await context.db.patch(existingQueueItem._id, {
        bookIntakeId: args.intakeId,
      })
    }

    if (!scrapeQueueId) {
      scrapeQueueId = await context.db.insert('scrapeQueue', {
        url: cleanedUrl,
        type: 'book',
        status: 'pending',
        priority: 0,
        displayName: intakeItem.title,
        scrapeFullSeries: false,
        source: 'user',
        referrerUrl: intakeItem.sourcePath,
        referrerReason: buildIntakeReferrerReason(intakeItem),
        skipAuthorDiscovery: true,
        bookIntakeId: args.intakeId,
        createdAt: Date.now(),
      })
    }

    await context.db.patch(args.intakeId, {
      status: 'waiting_for_scrape',
      matchedAsin,
      matchedAmazonUrl: cleanedUrl,
      scrapeQueueId,
      ...clearWorkerLeaseFields(),
      updatedAt: Date.now(),
    })

    return null
  },
})

export const attachScrapedBook = internalMutation({
  args: {
    intakeId: v.id('bookIntake'),
    bookId: v.id('books'),
    scrapeQueueId: v.optional(v.id('scrapeQueue')),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const intakeItem = await context.db.get(args.intakeId)
    if (!intakeItem) return null

    await finalizeLinkedBook(context, {
      intakeItem,
      bookId: args.bookId,
      scrapeQueueId: args.scrapeQueueId,
    })

    if (!intakeItem.matchedAmazonUrl) return null

    const siblings = await context.db
      .query('bookIntake')
      .withIndex('by_matchedAmazonUrl', (query) => query.eq('matchedAmazonUrl', intakeItem.matchedAmazonUrl))
      .collect()

    for (const sibling of siblings) {
      if (sibling._id === intakeItem._id) continue
      if (sibling.status !== 'waiting_for_scrape') continue

      await finalizeLinkedBook(context, {
        intakeItem: sibling,
        bookId: args.bookId,
        scrapeQueueId: sibling.scrapeQueueId,
      })
    }

    return null
  },
})

export const markScrapeFailed = internalMutation({
  args: {
    intakeId: v.id('bookIntake'),
    scrapeQueueId: v.optional(v.id('scrapeQueue')),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const intakeItem = await context.db.get(args.intakeId)
    if (!intakeItem) return null

    await context.db.patch(args.intakeId, {
      status: 'needs_review',
      lastError: args.errorMessage,
      needsReviewReason: `Scrape failed: ${args.errorMessage}`,
      scrapeQueueId: args.scrapeQueueId ?? intakeItem.scrapeQueueId,
      ...clearWorkerLeaseFields(),
      updatedAt: Date.now(),
    })

    return null
  },
})

async function finalizeLinkedBook(
  context: MutationCtx,
  params: {
    intakeItem: Doc<'bookIntake'>
    bookId: Id<'books'>
    matchedAsin?: string
    matchedAmazonUrl?: string
    scrapeQueueId?: Id<'scrapeQueue'>
  },
) {
  const book = await context.db.get(params.bookId)
  const now = Date.now()

  await context.db.patch(params.intakeItem._id, {
    status: 'linked',
    matchedBookId: params.bookId,
    matchedAsin: params.matchedAsin ?? params.intakeItem.matchedAsin ?? book?.asin,
    matchedAmazonUrl: params.matchedAmazonUrl ?? params.intakeItem.matchedAmazonUrl ?? book?.amazonUrl,
    scrapeQueueId: params.scrapeQueueId ?? params.intakeItem.scrapeQueueId,
    lastError: undefined,
    needsReviewReason: undefined,
    ...clearWorkerLeaseFields(),
    resolvedAt: now,
    updatedAt: now,
  })

  if (params.intakeItem.sourceType !== 'award') return
  if (!params.intakeItem.linkedAwardName || !params.intakeItem.linkedAwardYear || !params.intakeItem.linkedAwardCategory) return

  await context.runMutation(internal.awards.mutations.linkImportedAwardResult, {
    bookId: params.bookId,
    awardName: params.intakeItem.linkedAwardName,
    year: params.intakeItem.linkedAwardYear,
    category: params.intakeItem.linkedAwardCategory,
    resultType: params.intakeItem.linkedAwardResultType ?? 'other',
    sourceName: params.intakeItem.sourceLabel,
    sourcePage: params.intakeItem.sourcePage,
    sourceText: params.intakeItem.rawText,
  })
}

async function findClaimableIntakeItem(context: MutationCtx) {
  const pendingItem = await context.db
    .query('bookIntake')
    .withIndex('by_status_createdAt', (query) => query.eq('status', 'pending'))
    .first()
  if (pendingItem) return pendingItem

  const now = Date.now()
  const researchingItems = await context.db
    .query('bookIntake')
    .withIndex('by_status_createdAt', (query) => query.eq('status', 'researching'))
    .take(20)

  return researchingItems.find((item) => item.leaseExpiresAt !== undefined && item.leaseExpiresAt < now) ?? null
}

async function findBySourceKey(context: MutationCtx, sourceKey: string) {
  return await context.db
    .query('bookIntake')
    .withIndex('by_sourceKey', (query) => query.eq('sourceKey', sourceKey))
    .first()
}

function toClaimedItem(intakeItem: Doc<'bookIntake'>) {
  return {
    _id: intakeItem._id,
    title: intakeItem.title,
    authorName: intakeItem.authorName ?? null,
    illustratorName: intakeItem.illustratorName ?? null,
    searchQuery: intakeItem.searchQuery,
    sourceType: intakeItem.sourceType,
    sourceLabel: intakeItem.sourceLabel ?? null,
    sourcePath: intakeItem.sourcePath ?? null,
    sourcePage: intakeItem.sourcePage ?? null,
    rawText: intakeItem.rawText ?? null,
    sourceMetadataJson: intakeItem.sourceMetadataJson ?? null,
    linkedAwardName: intakeItem.linkedAwardName ?? null,
    linkedAwardYear: intakeItem.linkedAwardYear ?? null,
    linkedAwardCategory: intakeItem.linkedAwardCategory ?? null,
    linkedAwardResultType: intakeItem.linkedAwardResultType ?? null,
  }
}

function buildSearchQuery(params: {
  title: string
  authorName?: string
  illustratorName?: string
}) {
  const title = params.title.trim()
  const authorName = trimOptional(params.authorName)
  const illustratorName = trimOptional(params.illustratorName)

  return [title, authorName ?? illustratorName].filter(Boolean).join(' ')
}

function buildManualSourceKey(params: {
  title: string
  authorName?: string
  sourceLabel?: string
}) {
  const normalizedTitle = normalizeTitleForComparison(params.title)
  const normalizedAuthor = normalizeNameForComparison(params.authorName ?? '')
  const normalizedLabel = normalizeTitleForComparison(params.sourceLabel ?? 'manual')
  return `manual:${normalizedLabel}:${normalizedTitle}:${normalizedAuthor}`
}

function createManualIntakeDocument(params: {
  sourceKey: string
  title: string
  authorName?: string
  illustratorName?: string
  sourceLabel?: string
  rawText?: string
}) {
  const now = Date.now()

  return {
    title: params.title.trim(),
    authorName: trimOptional(params.authorName),
    illustratorName: trimOptional(params.illustratorName),
    searchQuery: buildSearchQuery(params),
    sourceType: 'manual' as const,
    sourceKey: params.sourceKey,
    sourceLabel: trimOptional(params.sourceLabel),
    rawText: trimOptional(params.rawText),
    status: 'pending' as const,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function createAwardIntakeDocument(params: {
  entry: {
    awardName: string
    year: number
    resultType: 'winner' | 'honor' | 'finalist' | 'other'
    categoryLabel: string
    title: string
    author?: string
    illustrator?: string
    sourceName: string
    sourcePath: string
    sourcePage?: number
    rawText: string
  }
  sourceKey: string
}) {
  const now = Date.now()
  const { entry } = params

  return {
    title: entry.title.trim(),
    authorName: trimOptional(entry.author),
    illustratorName: trimOptional(entry.illustrator),
    searchQuery: buildSearchQuery({
      title: entry.title,
      authorName: entry.author,
      illustratorName: entry.illustrator,
    }),
    sourceType: 'award' as const,
    sourceKey: params.sourceKey,
    sourceLabel: entry.sourceName,
    sourcePath: entry.sourcePath,
    sourcePage: entry.sourcePage,
    rawText: entry.rawText,
    sourceMetadataJson: buildAwardSourceMetadataJson(entry),
    status: 'pending' as const,
    attemptCount: 0,
    linkedAwardName: entry.awardName,
    linkedAwardYear: entry.year,
    linkedAwardCategory: entry.categoryLabel,
    linkedAwardResultType: entry.resultType,
    createdAt: now,
    updatedAt: now,
  }
}

function buildAwardSourceMetadataJson(entry: {
  awardName: string
  year: number
  resultType: 'winner' | 'honor' | 'finalist' | 'other'
  categoryLabel: string
}) {
  return JSON.stringify({
    awardName: entry.awardName,
    year: entry.year,
    resultType: entry.resultType,
    categoryLabel: entry.categoryLabel,
  })
}

function buildIntakeReferrerReason(intakeItem: Doc<'bookIntake'>) {
  if (intakeItem.sourceType === 'award' && intakeItem.linkedAwardName) {
    return `book-intake:award:${intakeItem.linkedAwardName.toLowerCase()}`
  }

  if (intakeItem.sourceLabel) {
    return `book-intake:${intakeItem.sourceLabel.toLowerCase()}`
  }

  return `book-intake:${intakeItem.sourceType}`
}

function cleanAmazonUrl(url: string) {
  try {
    return normalizeAmazonUrl(url)
  } catch {
    return url.trim()
  }
}

function trimOptional(value: string | undefined) {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return undefined
  return trimmedValue
}

function clearWorkerLeaseFields() {
  return {
    leaseExpiresAt: undefined,
    workerId: undefined,
  }
}
