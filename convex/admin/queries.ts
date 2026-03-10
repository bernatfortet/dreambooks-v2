import { query } from '../_generated/server'
import { v } from 'convex/values'
import { isBookVisibleForDiscovery } from '../lib/bookVisibility'

/**
 * Get database statistics for admin dashboard.
 */
export const stats = query({
  returns: v.object({
    books: v.number(),
    series: v.number(),
    authors: v.number(),
  }),
  handler: async (context) => {
    const books = await context.db.query('books').collect()
    const series = await context.db.query('series').collect()
    const authors = await context.db.query('authors').collect()

    return {
      books: books.length,
      series: series.length,
      authors: authors.length,
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
