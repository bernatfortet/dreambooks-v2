import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { generateUniqueSlug } from '../lib/slug'

/**
 * Upsert publisher by name (case-insensitive match).
 * Returns existing publisher ID or creates new one.
 */
export const upsertByName = internalMutation({
  args: {
    name: v.string(),
  },
  returns: v.id('publishers'),
  handler: async (context, args) => {
    const name = args.name.trim()
    const nameNormalized = name.toLowerCase()

    // Fast indexed case-insensitive lookup
    const existing = await context.db
      .query('publishers')
      .withIndex('by_nameNormalized', (q) => q.eq('nameNormalized', nameNormalized))
      .unique()

    if (existing) {
      return existing._id
    }

    // Create new publisher
    const publisherId = await context.db.insert('publishers', {
      name,
      nameNormalized,
      createdAt: Date.now(),
    })

    const slug = await generateUniqueSlug(context, 'publishers', name, publisherId)
    await context.db.patch(publisherId, { slug })

    console.log('📚 Created publisher:', { name, publisherId })
    return publisherId
  },
})
