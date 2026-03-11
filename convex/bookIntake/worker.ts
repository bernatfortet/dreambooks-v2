'use node'

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { v } from 'convex/values'
import { requireScrapeImportKey } from '../lib/scrapeImportAuth'

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

type ClaimedItem = {
  _id: Id<'bookIntake'>
  title: string
  authorName: string | null
  illustratorName: string | null
  searchQuery: string
  sourceType: 'manual' | 'award' | 'list'
  sourceLabel: string | null
  sourcePath: string | null
  sourcePage: number | null
  rawText: string | null
  sourceMetadataJson: string | null
  linkedAwardName: string | null
  linkedAwardYear: number | null
  linkedAwardCategory: string | null
  linkedAwardResultType: 'winner' | 'honor' | 'finalist' | 'other' | null
}

export const claimNextPending = action({
  args: {
    apiKey: v.string(),
    workerId: v.string(),
  },
  returns: v.union(claimedItemValidator, v.null()),
  handler: async (context, args): Promise<ClaimedItem | null> => {
    requireScrapeImportKey(args.apiKey)

    return await context.runMutation(internal.bookIntake.mutations.claimNextPendingInternal, {
      workerId: args.workerId,
    })
  },
})

export const markNeedsReview = action({
  args: {
    apiKey: v.string(),
    intakeId: v.id('bookIntake'),
    reason: v.optional(v.string()),
    candidateSnapshotJson: v.optional(v.string()),
    matchedAsin: v.optional(v.string()),
    matchedAmazonUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args): Promise<null> => {
    requireScrapeImportKey(args.apiKey)

    return await context.runMutation(internal.bookIntake.mutations.markNeedsReviewInternal, {
      intakeId: args.intakeId,
      reason: args.reason,
      candidateSnapshotJson: args.candidateSnapshotJson,
      matchedAsin: args.matchedAsin,
      matchedAmazonUrl: args.matchedAmazonUrl,
    })
  },
})

export const markFailed = action({
  args: {
    apiKey: v.string(),
    intakeId: v.id('bookIntake'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args): Promise<null> => {
    requireScrapeImportKey(args.apiKey)

    return await context.runMutation(internal.bookIntake.mutations.markFailedInternal, {
      intakeId: args.intakeId,
      errorMessage: args.errorMessage,
    })
  },
})

export const markResolvedExisting = action({
  args: {
    apiKey: v.string(),
    intakeId: v.id('bookIntake'),
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args): Promise<null> => {
    requireScrapeImportKey(args.apiKey)

    return await context.runMutation(internal.bookIntake.mutations.markResolvedExistingInternal, {
      intakeId: args.intakeId,
      bookId: args.bookId,
    })
  },
})

export const markReadyToScrape = action({
  args: {
    apiKey: v.string(),
    intakeId: v.id('bookIntake'),
    amazonUrl: v.string(),
  },
  returns: v.null(),
  handler: async (context, args): Promise<null> => {
    requireScrapeImportKey(args.apiKey)

    return await context.runMutation(internal.bookIntake.mutations.markReadyToScrapeInternal, {
      intakeId: args.intakeId,
      amazonUrl: args.amazonUrl,
    })
  },
})
