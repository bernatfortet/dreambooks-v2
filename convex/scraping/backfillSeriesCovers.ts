'use node'

import { action, internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'

/**
 * Backfill series covers for existing series that have coverSourceUrl
 * but no coverStorageId. Schedules downloads with staggered delays to
 * avoid thundering herd.
 */
export const backfillSeriesCovers = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scheduled: v.number(),
  }),
  handler: async (context, args): Promise<{ scheduled: number }> => {
    const limit = args.limit ?? 50
    const series: Array<{ _id: Id<'series'>; coverSourceUrl: string }> = await context.runQuery(internal.series.queries.listMissingCovers, {
      limit,
    })

    for (let i = 0; i < series.length; i++) {
      await context.scheduler.runAfter(i * 500, internal.scraping.downloadSeriesCover.downloadSeriesCover, {
        seriesId: series[i]._id,
        sourceUrl: series[i].coverSourceUrl,
      })
    }

    return { scheduled: series.length }
  },
})

/**
 * Public wrapper for backfillSeriesCovers (for use in scripts).
 */
export const backfillSeriesCoversPublic = action({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scheduled: v.number(),
  }),
  handler: async (context, args): Promise<{ scheduled: number }> => {
    const limit = args.limit ?? 50
    const series: Array<{ _id: Id<'series'>; coverSourceUrl: string }> = await context.runQuery(internal.series.queries.listMissingCovers, {
      limit,
    })

    for (let i = 0; i < series.length; i++) {
      await context.scheduler.runAfter(i * 500, internal.scraping.downloadSeriesCover.downloadSeriesCover, {
        seriesId: series[i]._id,
        sourceUrl: series[i].coverSourceUrl,
      })
    }

    return { scheduled: series.length }
  },
})
