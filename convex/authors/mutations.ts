import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Upsert an author from scrape data.
 * Uses amazonAuthorId as the unique key.
 */
export const upsertFromScrape = internalMutation({
  args: {
    name: v.string(),
    bio: v.optional(v.string()),
    amazonAuthorId: v.string(),
    sourceUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    imageSourceUrl: v.optional(v.string()),
  },
  returns: v.object({
    authorId: v.id('authors'),
    isNew: v.boolean(),
  }),
  handler: async (context, args) => {
    const existing = await context.db
      .query('authors')
      .withIndex('by_amazonAuthorId', (q) => q.eq('amazonAuthorId', args.amazonAuthorId))
      .unique()

    if (existing) {
      await context.db.patch(existing._id, {
        name: args.name,
        bio: args.bio ?? existing.bio,
        sourceUrl: args.sourceUrl ?? existing.sourceUrl,
        imageStorageId: args.imageStorageId ?? existing.imageStorageId,
        imageSourceUrl: args.imageSourceUrl ?? existing.imageSourceUrl,
        scrapeStatus: 'complete',
        lastScrapedAt: Date.now(),
        errorMessage: undefined,
      })

      console.log('📝 Updated author:', { name: args.name, authorId: existing._id })
      return { authorId: existing._id, isNew: false }
    }

    const authorId = await context.db.insert('authors', {
      name: args.name,
      bio: args.bio,
      source: 'amazon',
      amazonAuthorId: args.amazonAuthorId,
      sourceUrl: args.sourceUrl,
      imageStorageId: args.imageStorageId,
      imageSourceUrl: args.imageSourceUrl,
      scrapeStatus: 'complete',
      lastScrapedAt: Date.now(),
      createdAt: Date.now(),
    })

    console.log('✅ Created author:', { name: args.name, authorId })
    return { authorId, isNew: true }
  },
})

/**
 * Mark an author as having an error during scraping.
 */
export const markError = internalMutation({
  args: {
    authorId: v.id('authors'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.authorId, {
      scrapeStatus: 'error',
      errorMessage: args.errorMessage,
    })
    return null
  },
})
