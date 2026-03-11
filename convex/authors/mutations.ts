import { internalMutation, mutation } from '../_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import { generateUniqueSlug } from '../lib/slug'
import { deleteScrapeArtifacts, clearScrapeQueueReferences, deleteStorageFile } from '../lib/deleteHelpers'
import { requireSuperadmin } from '../lib/superadmin'

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
    sourceImageUrl: v.optional(v.string()),
    scrapeVersion: v.optional(v.number()),
    firstSeenFromUrl: v.optional(v.string()),
    firstSeenReason: v.optional(v.string()),
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
      const patch: Partial<Doc<'authors'>> = {
        name: args.name,
        bio: args.bio ?? existing.bio,
        sourceUrl: args.sourceUrl ?? existing.sourceUrl,
        ...(args.scrapeVersion !== undefined ? { scrapeVersion: args.scrapeVersion } : {}),
        // Only set firstSeenFromUrl/firstSeenReason if author doesn't already have them (preserve original provenance)
        ...(args.firstSeenFromUrl !== undefined && !existing.firstSeenFromUrl ? { firstSeenFromUrl: args.firstSeenFromUrl } : {}),
        ...(args.firstSeenReason !== undefined && !existing.firstSeenReason ? { firstSeenReason: args.firstSeenReason } : {}),
        scrapeStatus: 'complete',
        lastScrapedAt: Date.now(),
        errorMessage: undefined,
        ...(args.sourceImageUrl
          ? {
              image: {
                ...(existing.image ?? {}),
                sourceImageUrl: args.sourceImageUrl,
              },
            }
          : {}),
      }

      await context.db.patch(existing._id, patch)

      if (args.name !== existing.name) {
        const slug = await generateUniqueSlug(context, 'authors', args.name, existing._id)
        await context.db.patch(existing._id, { slug })
      }

      console.log('📝 Updated author:', { name: args.name, authorId: existing._id })
      return { authorId: existing._id, isNew: false }
    }

    const authorId = await context.db.insert('authors', {
      name: args.name,
      bio: args.bio,
      source: 'amazon',
      amazonAuthorId: args.amazonAuthorId,
      sourceUrl: args.sourceUrl,
      ...(args.sourceImageUrl ? { image: { sourceImageUrl: args.sourceImageUrl } } : {}),
      scrapeVersion: args.scrapeVersion,
      firstSeenFromUrl: args.firstSeenFromUrl,
      firstSeenReason: args.firstSeenReason,
      scrapeStatus: 'complete',
      lastScrapedAt: Date.now(),
      createdAt: Date.now(),
    })
    const slug = await generateUniqueSlug(context, 'authors', args.name, authorId)
    await context.db.patch(authorId, { slug })

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

/**
 * Update an author's slug (for migration).
 */
export const updateSlug = mutation({
  args: {
    authorId: v.id('authors'),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const slug = await generateUniqueSlug(context, 'authors', args.name, args.authorId)
    await context.db.patch(args.authorId, { slug })
    return null
  },
})

/**
 * Update an author's multi-size image after downloading all sizes.
 */
export const updateImage = internalMutation({
  args: {
    authorId: v.id('authors'),
    storageIdThumb: v.optional(v.id('_storage')),
    storageIdMedium: v.optional(v.id('_storage')),
    storageIdLarge: v.optional(v.id('_storage')),
    sourceImageUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await context.db.patch(args.authorId, {
      image: {
        sourceImageUrl: args.sourceImageUrl,
        storageIdThumb: args.storageIdThumb,
        storageIdMedium: args.storageIdMedium,
        storageIdLarge: args.storageIdLarge,
      },
    })
    return null
  },
})

/**
 * Clear bad image data from an author (for fixing incorrectly scraped images).
 * Note: Storage files are not deleted by this mutation (only the reference is cleared).
 * Use deleteAuthor mutation to delete the storage file along with the author.
 */
export const clearImageData = mutation({
  args: {
    authorId: v.id('authors'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const author = await context.db.get(args.authorId)
    if (!author) {
      throw new Error('Author not found')
    }

    await context.db.patch(args.authorId, {
      image: undefined,
    })

    return null
  },
})

/**
 * Delete an author (admin utility).
 * Cascades to delete:
 * - All bookAuthors entries (unlinks author from books, but doesn't delete books)
 * - Image storage file
 * - Scrape artifacts
 * - Scrape queue references
 */
export const deleteAuthor = mutation({
  args: {
    authorId: v.id('authors'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await requireSuperadmin(context)

    const author = await context.db.get(args.authorId)

    if (!author) {
      throw new Error('Author not found')
    }

    console.log('🗑️ Deleting author', { authorId: args.authorId, name: author.name })

    // Delete all bookAuthors entries (unlinks author from books)
    const bookAuthors = await context.db
      .query('bookAuthors')
      .withIndex('by_authorId', (q) => q.eq('authorId', args.authorId))
      .collect()

    for (const link of bookAuthors) {
      await context.db.delete(link._id)
    }

    // Delete image storage files
    if (author.image) {
      const storageIds = [author.image.storageIdThumb, author.image.storageIdMedium, author.image.storageIdLarge].filter(
        Boolean,
      ) as Id<'_storage'>[]

      const uniqueStorageIds = [...new Set(storageIds)]
      for (const storageId of uniqueStorageIds) {
        await deleteStorageFile(context.storage, storageId)
      }
    }

    // Delete scrape artifacts
    const artifactsDeleted = await deleteScrapeArtifacts(context.db, 'author', args.authorId)

    // Clear scrape queue references
    const queueCleared = await clearScrapeQueueReferences(context.db, 'author', args.authorId)

    // Delete the author
    await context.db.delete(args.authorId)

    console.log('✅ Author deleted', {
      authorId: args.authorId,
      bookAuthorsDeleted: bookAuthors.length,
      artifactsDeleted,
      queueCleared,
    })

    return null
  },
})
