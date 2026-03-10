import { query } from '../_generated/server'
import { v } from 'convex/values'

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
