import { mutation, internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { generateUniqueSlug } from '../lib/slug'

/**
 * Create a new award.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    imageSourceUrl: v.optional(v.string()),
  },
  returns: v.id('awards'),
  handler: async (context, args) => {
    const awardId = await context.db.insert('awards', {
      name: args.name,
      description: args.description,
      imageStorageId: args.imageStorageId,
      imageSourceUrl: args.imageSourceUrl,
      createdAt: Date.now(),
    })
    const slug = await generateUniqueSlug(context, 'awards', args.name, awardId)
    await context.db.patch(awardId, { slug })

    console.log('✨ Created award:', { name: args.name, awardId })
    return awardId
  },
})

/**
 * Upsert an award by name.
 * Useful for seeding data - creates if doesn't exist, updates if it does.
 */
export const upsertByName = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    imageSourceUrl: v.optional(v.string()),
  },
  returns: v.object({
    awardId: v.id('awards'),
    isNew: v.boolean(),
  }),
  handler: async (context, args) => {
    const existing = await context.db
      .query('awards')
      .withIndex('by_name', (q) => q.eq('name', args.name))
      .unique()

    if (existing) {
      await context.db.patch(existing._id, {
        description: args.description ?? existing.description,
        imageStorageId: args.imageStorageId ?? existing.imageStorageId,
        imageSourceUrl: args.imageSourceUrl ?? existing.imageSourceUrl,
      })

      if (args.name !== existing.name) {
        const slug = await generateUniqueSlug(context, 'awards', args.name, existing._id)
        await context.db.patch(existing._id, { slug })
      }

      console.log('📝 Updated award:', { name: args.name, awardId: existing._id })
      return { awardId: existing._id, isNew: false }
    }

    const awardId = await context.db.insert('awards', {
      name: args.name,
      description: args.description,
      imageStorageId: args.imageStorageId,
      imageSourceUrl: args.imageSourceUrl,
      createdAt: Date.now(),
    })
    const slug = await generateUniqueSlug(context, 'awards', args.name, awardId)
    await context.db.patch(awardId, { slug })

    console.log('✨ Created award:', { name: args.name, awardId })
    return { awardId, isNew: true }
  },
})

/**
 * Update an award's image storage ID.
 * Used internally by the scraping pipeline.
 */
export const updateImageStorageId = internalMutation({
  args: {
    awardId: v.id('awards'),
    imageStorageId: v.id('_storage'),
  },
  handler: async (context, args) => {
    await context.db.patch(args.awardId, {
      imageStorageId: args.imageStorageId,
    })
  },
})

/**
 * Update an award's slug (for migration).
 */
export const updateSlug = mutation({
  args: {
    awardId: v.id('awards'),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const slug = await generateUniqueSlug(context, 'awards', args.name, args.awardId)
    await context.db.patch(args.awardId, { slug })
    return null
  },
})
