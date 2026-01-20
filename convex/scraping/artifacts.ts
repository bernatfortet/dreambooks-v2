import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

export const create = internalMutation({
  args: {
    entityType: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    entityId: v.optional(v.union(v.id('books'), v.id('series'), v.id('authors'))),
    sourceUrl: v.string(),
    adapter: v.string(),
    scrapeVersion: v.number(),
    payloadJson: v.string(),
  },
  returns: v.id('scrapeArtifacts'),
  handler: async (context, args) => {
    const id = await context.db.insert('scrapeArtifacts', {
      ...args,
      createdAt: Date.now(),
    })

    return id
  },
})

