import { mutation, internalMutation, type MutationCtx } from '../_generated/server'
import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import { generateUniqueSlug } from '../lib/slug'

const awardResultTypeValidator = v.union(
  v.literal('winner'),
  v.literal('honor'),
  v.literal('finalist'),
  v.literal('other'),
)

const bookAwardResultInputValidator = v.object({
  bookId: v.id('books'),
  awardName: v.string(),
  year: v.number(),
  category: v.string(),
  resultType: awardResultTypeValidator,
  sourceName: v.optional(v.string()),
  sourcePage: v.optional(v.number()),
  sourceText: v.optional(v.string()),
  importBatchKey: v.optional(v.string()),
})

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
 * Upsert a single book-award result row for historical award imports.
 */
export const upsertBookAwardResult = mutation({
  args: bookAwardResultInputValidator,
  returns: v.object({
    awardId: v.id('awards'),
    bookAwardId: v.id('bookAwards'),
    created: v.boolean(),
  }),
  handler: async (context, args) => {
    const awardId = await getOrCreateAward(context, {
      name: args.awardName,
    })

    const result = await upsertBookAwardLink(context, {
      bookId: args.bookId,
      awardId,
      year: args.year,
      category: args.category,
      resultType: args.resultType,
      sourceName: args.sourceName,
      sourcePage: args.sourcePage,
      sourceText: args.sourceText,
      importBatchKey: args.importBatchKey,
    })

    return {
      awardId,
      bookAwardId: result.bookAwardId,
      created: result.created,
    }
  },
})

/**
 * Upsert many book-award result rows in one call for batch scripts.
 */
export const upsertBookAwardResults = mutation({
  args: {
    entries: v.array(bookAwardResultInputValidator),
  },
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    awardIds: v.array(v.id('awards')),
    bookAwardIds: v.array(v.id('bookAwards')),
  }),
  handler: async (context, args) => {
    const awardIds = new Set<Id<'awards'>>()
    const bookAwardIds: Id<'bookAwards'>[] = []

    let created = 0
    let updated = 0

    for (const entry of args.entries) {
      const awardId = await getOrCreateAward(context, {
        name: entry.awardName,
      })

      const result = await upsertBookAwardLink(context, {
        bookId: entry.bookId,
        awardId,
        year: entry.year,
        category: entry.category,
        resultType: entry.resultType,
        sourceName: entry.sourceName,
        sourcePage: entry.sourcePage,
        sourceText: entry.sourceText,
        importBatchKey: entry.importBatchKey,
      })

      awardIds.add(awardId)
      bookAwardIds.push(result.bookAwardId)

      if (result.created) {
        created += 1
      } else {
        updated += 1
      }
    }

    return {
      created,
      updated,
      awardIds: [...awardIds],
      bookAwardIds,
    }
  },
})

export const linkImportedAwardResult = internalMutation({
  args: {
    bookId: v.id('books'),
    awardName: v.string(),
    year: v.number(),
    category: v.string(),
    resultType: awardResultTypeValidator,
    sourceName: v.optional(v.string()),
    sourcePage: v.optional(v.number()),
    sourceText: v.optional(v.string()),
  },
  returns: v.object({
    awardId: v.id('awards'),
    bookAwardId: v.id('bookAwards'),
    created: v.boolean(),
  }),
  handler: async (context, args) => {
    const awardId = await getOrCreateAward(context, {
      name: args.awardName,
    })

    const result = await upsertBookAwardLink(context, {
      bookId: args.bookId,
      awardId,
      year: args.year,
      category: args.category,
      resultType: args.resultType,
      sourceName: args.sourceName,
      sourcePage: args.sourcePage,
      sourceText: args.sourceText,
    })

    return {
      awardId,
      bookAwardId: result.bookAwardId,
      created: result.created,
    }
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

async function getOrCreateAward(
  context: MutationCtx,
  params: {
    name: string
    description?: string
    imageStorageId?: Id<'_storage'>
    imageSourceUrl?: string
  },
) {
  const existing = await context.db
    .query('awards')
    .withIndex('by_name', (q) => q.eq('name', params.name))
    .unique()

  if (existing) {
    return existing._id
  }

  const awardId = await context.db.insert('awards', {
    name: params.name,
    description: params.description,
    imageStorageId: params.imageStorageId,
    imageSourceUrl: params.imageSourceUrl,
    createdAt: Date.now(),
  })

  const slug = await generateUniqueSlug(context, 'awards', params.name, awardId)
  await context.db.patch(awardId, { slug })

  return awardId
}

async function upsertBookAwardLink(
  context: MutationCtx,
  params: {
    bookId: Id<'books'>
    awardId: Id<'awards'>
    year: number
    category: string
    resultType: 'winner' | 'honor' | 'finalist' | 'other'
    sourceName?: string
    sourcePage?: number
    sourceText?: string
    importBatchKey?: string
  },
) {
  const existing = await context.db
    .query('bookAwards')
    .withIndex('by_bookId_awardId_year_resultType', (q) =>
      q.eq('bookId', params.bookId).eq('awardId', params.awardId).eq('year', params.year).eq('resultType', params.resultType),
    )
    .unique()

  const patch = {
    category: params.category,
    resultType: params.resultType,
    sourceName: params.sourceName,
    sourcePage: params.sourcePage,
    sourceText: params.sourceText,
    importBatchKey: params.importBatchKey,
    importedAt: Date.now(),
  }

  if (existing) {
    await context.db.patch(existing._id, patch)

    return {
      bookAwardId: existing._id,
      created: false,
    }
  }

  const bookAwardId = await context.db.insert('bookAwards', {
    bookId: params.bookId,
    awardId: params.awardId,
    year: params.year,
    category: params.category,
    resultType: params.resultType,
    sourceName: params.sourceName,
    sourcePage: params.sourcePage,
    sourceText: params.sourceText,
    importBatchKey: params.importBatchKey,
    importedAt: Date.now(),
    createdAt: Date.now(),
  })

  return {
    bookAwardId,
    created: true,
  }
}

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
