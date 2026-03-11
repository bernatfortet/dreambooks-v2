'use node'

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import { requireScrapeImportKey } from '../lib/scrapeImportAuth'

/**
 * Migration utility: merge duplicate books created from series scraping.
 *
 * Duplicates typically happen when Amazon shows different ASINs (Kindle vs paperback)
 * for the same series entry across scrapes.
 *
 * This action is protected by SCRAPE_IMPORT_KEY (same as other local-scrape tooling).
 */
export const mergeDuplicatesBySeriesPosition = action({
  args: {
    apiKey: v.string(),
    seriesId: v.optional(v.id('series')),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    groupsFound: v.number(),
    booksDeleted: v.number(),
    merges: v.array(
      v.object({
        seriesId: v.id('series'),
        seriesPosition: v.number(),
        keeperBookId: v.id('books'),
        deletedBookIds: v.array(v.id('books')),
      }),
    ),
  }),
  handler: async (context, args): Promise<{
    groupsFound: number
    booksDeleted: number
    merges: Array<{
      seriesId: Id<'series'>
      seriesPosition: number
      keeperBookId: Id<'books'>
      deletedBookIds: Id<'books'>[]
    }>
  }> => {
    requireScrapeImportKey(args.apiKey)

    return await context.runMutation(internal.books.mutations.mergeDuplicatesBySeriesPosition, {
      seriesId: args.seriesId,
      dryRun: args.dryRun,
      limit: args.limit,
    })
  },
})

