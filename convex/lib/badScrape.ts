import { mutation, query } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Mark an entity as having bad scrape data.
 * Use this when you notice incorrect or incomplete scraped data.
 */
export const markBadScrape = mutation({
  args: {
    entityType: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    entityId: v.union(v.id('books'), v.id('series'), v.id('authors')),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.entityId, {
      badScrape: true,
      badScrapeNotes: args.notes,
      badScrapeMarkedAt: Date.now(),
    })
    return null
  },
})

/**
 * Clear the bad scrape flag from an entity.
 * Call this after investigating and re-scraping.
 */
export const clearBadScrape = mutation({
  args: {
    entityId: v.union(v.id('books'), v.id('series'), v.id('authors')),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.entityId, {
      badScrape: false,
      badScrapeNotes: undefined,
      badScrapeMarkedAt: undefined,
    })
    return null
  },
})

/**
 * List all entities flagged as bad scrapes.
 * Returns books, series, and authors separately.
 */
export const listBadScrapes = query({
  args: {},
  handler: async (context) => {
    const [books, seriesList, authors] = await Promise.all([
      context.db
        .query('books')
        .withIndex('by_badScrape', (q) => q.eq('badScrape', true))
        .collect(),
      context.db
        .query('series')
        .withIndex('by_badScrape', (q) => q.eq('badScrape', true))
        .collect(),
      context.db
        .query('authors')
        .withIndex('by_badScrape', (q) => q.eq('badScrape', true))
        .collect(),
    ])

    return { books, series: seriesList, authors }
  },
})
