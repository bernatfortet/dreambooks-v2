import { query } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import { v } from 'convex/values'
import { isBookVisibleForDiscovery } from '../lib/bookVisibility'
import { readSystemStatsWithFallback } from '../lib/systemStats'
import { requireScrapeImportKey } from '../lib/scrapeImportAuth'
import { requireSuperadmin } from '../lib/superadmin'

async function requireAdminReadAccess(context: QueryCtx, apiKey: string | undefined) {
  if (apiKey) {
    requireScrapeImportKey(apiKey)
    return
  }

  await requireSuperadmin(context)
}

/**
 * Get database statistics for admin dashboard.
 */
export const stats = query({
  args: {
    apiKey: v.optional(v.string()),
  },
  returns: v.object({
    books: v.number(),
    series: v.number(),
    authors: v.number(),
  }),
  handler: async (context, args) => {
    await requireAdminReadAccess(context, args.apiKey)
    const stats = await readSystemStatsWithFallback(context.db)

    return {
      books: stats.entityCounts.books,
      series: stats.entityCounts.series,
      authors: stats.entityCounts.authors,
    }
  },
})

export const listBooksNeedingReview = query({
  returns: v.array(
    v.object({
      _id: v.id('books'),
      slug: v.union(v.string(), v.null()),
      title: v.string(),
      amazonUrl: v.union(v.string(), v.null()),
      needsReviewReason: v.union(v.string(), v.null()),
      needsReviewMarkedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (context) => {
    await requireSuperadmin(context)

    const books = await context.db
      .query('books')
      .withIndex('by_needsReview', (q) => q.eq('needsReview', true))
      .collect()

    return books
      .filter((book) => isBookVisibleForDiscovery(book))
      .sort((left, right) => (right.needsReviewMarkedAt ?? 0) - (left.needsReviewMarkedAt ?? 0))
      .map((book) => ({
        _id: book._id,
        slug: book.slug ?? null,
        title: book.title,
        amazonUrl: book.amazonUrl ?? null,
        needsReviewReason: book.needsReviewReason ?? null,
        needsReviewMarkedAt: book.needsReviewMarkedAt ?? null,
      }))
  },
})
