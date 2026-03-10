'use node'

import { action, internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'

/**
 * Backfill author images for existing authors that have `image.sourceImageUrl`
 * but no stored image yet. Schedules downloads with staggered delays to
 * avoid thundering herd.
 */
export const backfillAuthorImages = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scheduled: v.number(),
  }),
  handler: async (context, args): Promise<{ scheduled: number }> => {
    const limit = args.limit ?? 50
    const authors: Array<{ _id: Id<'authors'>; imageSourceUrl: string }> = await context.runQuery(
      internal.authors.queries.listMissingAvatars,
      { limit },
    )

    for (let i = 0; i < authors.length; i++) {
      await context.scheduler.runAfter(i * 500, internal.scraping.downloadAuthorImage.downloadAuthorImage, {
        authorId: authors[i]._id,
        sourceUrl: authors[i].imageSourceUrl,
      })
    }

    return { scheduled: authors.length }
  },
})

/**
 * Public wrapper for backfillAuthorImages (for use in scripts).
 */
export const backfillAuthorImagesPublic = action({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scheduled: v.number(),
  }),
  handler: async (context, args): Promise<{ scheduled: number }> => {
    const limit = args.limit ?? 50
    const authors: Array<{ _id: Id<'authors'>; imageSourceUrl: string }> = await context.runQuery(
      internal.authors.queries.listMissingAvatars,
      { limit },
    )

    for (let i = 0; i < authors.length; i++) {
      await context.scheduler.runAfter(i * 500, internal.scraping.downloadAuthorImage.downloadAuthorImage, {
        authorId: authors[i]._id,
        sourceUrl: authors[i].imageSourceUrl,
      })
    }

    return { scheduled: authors.length }
  },
})
