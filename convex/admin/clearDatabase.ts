import { action, internalMutation, internalQuery } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { requireScrapeImportKey } from '../lib/scrapeImportAuth'
import { requireSuperadmin } from '../lib/superadmin'

const BATCH_SIZE = 50

async function requireClearDatabaseAccess(params: {
  context: ActionCtx
  apiKey: string | undefined
}) {
  const { context, apiKey } = params

  if (apiKey) {
    requireScrapeImportKey(apiKey)
    return
  }

  await requireSuperadmin(context)
}

/**
 * Internal query to get all storage IDs from books (cover.storageId*).
 */
export const getBookStorageIds = internalQuery({
  returns: v.array(v.string()),
  handler: async (context) => {
    const books = await context.db.query('books').collect()
    const ids = new Set<string>()

    for (const book of books) {
      if (book.cover?.storageIdThumb) ids.add(book.cover.storageIdThumb)
      if (book.cover?.storageIdMedium) ids.add(book.cover.storageIdMedium)
      if (book.cover?.storageIdFull) ids.add(book.cover.storageIdFull)
    }

    return Array.from(ids)
  },
})

/**
 * Internal query to get all storage IDs from series (coverStorageId).
 */
export const getSeriesStorageIds = internalQuery({
  returns: v.array(v.string()),
  handler: async (context) => {
    const series = await context.db.query('series').collect()
    return series
      .map((s) => s.coverStorageId)
      .filter((id) => id !== undefined)
      .map((id) => id as string)
  },
})

/**
 * Internal query to get all storage IDs from authors (image storage IDs).
 */
export const getAuthorStorageIds = internalQuery({
  returns: v.array(v.string()),
  handler: async (context) => {
    const authors = await context.db.query('authors').collect()
    const storageIds: string[] = []
    for (const author of authors) {
      if (author.image) {
        if (author.image.storageIdThumb) storageIds.push(author.image.storageIdThumb)
        if (author.image.storageIdMedium) storageIds.push(author.image.storageIdMedium)
        if (author.image.storageIdLarge) storageIds.push(author.image.storageIdLarge)
      }
    }
    return storageIds
  },
})

/**
 * Internal query to get all storage IDs from awards (imageStorageId).
 */
export const getAwardStorageIds = internalQuery({
  returns: v.array(v.string()),
  handler: async (context) => {
    const awards = await context.db.query('awards').collect()
    return awards
      .map((a) => a.imageStorageId)
      .filter((id) => id !== undefined)
      .map((id) => id as string)
  },
})

/**
 * Internal mutation to delete a batch of storage files.
 */
export const deleteStorageBatch = internalMutation({
  args: {
    storageIds: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (context, args) => {
    let deleted = 0
    for (const storageId of args.storageIds) {
      try {
        await context.storage.delete(storageId as any)
        deleted++
      } catch (error) {
        console.error(`Failed to delete storage file ${storageId}:`, error)
      }
    }
    return deleted
  },
})

/**
 * Internal mutation to delete a batch of records from a table.
 */
export const deleteBatch = internalMutation({
  args: {
    tableName: v.union(
      v.literal('bookAwards'),
      v.literal('bookAuthors'),
      v.literal('books'),
      v.literal('series'),
      v.literal('authors'),
      v.literal('scrapeQueue'),
      v.literal('scrapeArtifacts'),
      v.literal('bookScrapeRuns'),
      v.literal('seriesScrapeRuns'),
    ),
    ids: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (context, args) => {
    let deleted = 0
    for (const idStr of args.ids) {
      try {
        await context.db.delete(idStr as any)
        deleted++
      } catch (error) {
        console.error(`Failed to delete ${idStr} from ${args.tableName}:`, error)
      }
    }
    return deleted
  },
})

/**
 * Internal query to get all IDs from a table.
 */
export const getAllIds = internalQuery({
  args: {
    tableName: v.union(
      v.literal('bookAwards'),
      v.literal('bookAuthors'),
      v.literal('books'),
      v.literal('series'),
      v.literal('authors'),
      v.literal('scrapeQueue'),
      v.literal('scrapeArtifacts'),
      v.literal('bookScrapeRuns'),
      v.literal('seriesScrapeRuns'),
    ),
  },
  returns: v.array(v.string()),
  handler: async (context, args) => {
    const results = await context.db.query(args.tableName as any).collect()
    return results.map((r) => r._id as string)
  },
})

/**
 * Clear all database tables except awards.
 * Uses batched deletions to avoid timeouts.
 */
export const clearAllExceptAwards = action({
  args: {
    apiKey: v.optional(v.string()),
  },
  returns: v.object({
    deleted: v.object({
      bookAwards: v.number(),
      bookAuthors: v.number(),
      books: v.number(),
      series: v.number(),
      authors: v.number(),
      scrapeQueue: v.number(),
      scrapeArtifacts: v.number(),
      bookScrapeRuns: v.number(),
      seriesScrapeRuns: v.number(),
      bookCovers: v.number(),
      seriesCovers: v.number(),
      authorImages: v.number(),
    }),
  }),
  handler: async (context, args) => {
    await requireClearDatabaseAccess({ context, apiKey: args.apiKey })

    const deleted: Record<string, number> = {
      bookAwards: 0,
      bookAuthors: 0,
      books: 0,
      series: 0,
      authors: 0,
      scrapeQueue: 0,
      scrapeArtifacts: 0,
      bookScrapeRuns: 0,
      seriesScrapeRuns: 0,
      bookCovers: 0,
      seriesCovers: 0,
      authorImages: 0,
    }

    // Helper to delete a table in batches
    const deleteTable = async (tableName: string) => {
      // Get all IDs
      const allIds = await context.runQuery(internal.admin.clearDatabase.getAllIds, {
        tableName: tableName as any,
      })

      if (allIds.length === 0) {
        console.log(`No records to delete from ${tableName}`)
        deleted[tableName] = 0
        return
      }

      let totalDeleted = 0

      // Delete in batches
      for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE)
        const count = await context.runMutation(internal.admin.clearDatabase.deleteBatch, {
          tableName: tableName as any,
          ids: batch,
        })

        totalDeleted += count
        console.log(`Deleted ${count} from ${tableName} (${totalDeleted}/${allIds.length})`)
      }

      deleted[tableName] = totalDeleted
      console.log(`✅ Completed ${tableName}: ${totalDeleted} deleted`)
    }

    // Helper to delete storage files in batches
    const deleteStorageFiles = async (storageIds: string[], type: 'bookCovers' | 'seriesCovers' | 'authorImages') => {
      if (storageIds.length === 0) {
        console.log(`No ${type} to delete`)
        deleted[type] = 0
        return
      }

      let totalDeleted = 0
      for (let i = 0; i < storageIds.length; i += BATCH_SIZE) {
        const batch = storageIds.slice(i, i + BATCH_SIZE)
        const count = await context.runMutation(internal.admin.clearDatabase.deleteStorageBatch, {
          storageIds: batch,
        })
        totalDeleted += count
        console.log(`Deleted ${count} ${type} (${totalDeleted}/${storageIds.length})`)
      }

      deleted[type] = totalDeleted
      console.log(`✅ Completed ${type}: ${totalDeleted} deleted`)
    }

    // Delete storage files first (before deleting records)
    console.log('Starting storage file deletion...')
    const bookStorageIds = await context.runQuery(internal.admin.clearDatabase.getBookStorageIds)
    await deleteStorageFiles(bookStorageIds, 'bookCovers')

    const seriesStorageIds = await context.runQuery(internal.admin.clearDatabase.getSeriesStorageIds)
    await deleteStorageFiles(seriesStorageIds, 'seriesCovers')

    const authorStorageIds = await context.runQuery(internal.admin.clearDatabase.getAuthorStorageIds)
    await deleteStorageFiles(authorStorageIds, 'authorImages')

    // Delete in order: join tables first, then main entities, then scrape data
    console.log('Starting database clear...')
    await deleteTable('bookAwards')
    await deleteTable('bookAuthors')
    await deleteTable('books')
    await deleteTable('series')
    await deleteTable('authors')
    await deleteTable('scrapeQueue')
    await deleteTable('scrapeArtifacts')
    await deleteTable('bookScrapeRuns')
    await deleteTable('seriesScrapeRuns')
    await context.runMutation(internal.systemStats.mutations.rebuild, {})

    console.log('✅ Database clear complete!', deleted)
    return { deleted: deleted as any }
  },
})

/**
 * Delete ALL storage files from the database.
 * This includes images from books, series, authors, and awards.
 */
export const deleteAllStorageFiles = action({
  args: {
    apiKey: v.optional(v.string()),
  },
  returns: v.object({
    deleted: v.object({
      bookCovers: v.number(),
      seriesCovers: v.number(),
      authorImages: v.number(),
      awardImages: v.number(),
      total: v.number(),
    }),
  }),
  handler: async (context, args) => {
    await requireClearDatabaseAccess({ context, apiKey: args.apiKey })

    const deleted = {
      bookCovers: 0,
      seriesCovers: 0,
      authorImages: 0,
      awardImages: 0,
      total: 0,
    }

    // Helper to delete storage files in batches
    const deleteStorageFiles = async (storageIds: string[], type: string) => {
      if (storageIds.length === 0) {
        console.log(`No ${type} to delete`)
        return 0
      }

      let totalDeleted = 0
      for (let i = 0; i < storageIds.length; i += BATCH_SIZE) {
        const batch = storageIds.slice(i, i + BATCH_SIZE)
        const count = await context.runMutation(internal.admin.clearDatabase.deleteStorageBatch, {
          storageIds: batch,
        })
        totalDeleted += count
        console.log(`Deleted ${count} ${type} (${totalDeleted}/${storageIds.length})`)
      }

      console.log(`✅ Completed ${type}: ${totalDeleted} deleted`)
      return totalDeleted
    }

    console.log('Starting storage file deletion...')

    // Delete from all tables (even if empty, to catch any remaining references)
    const bookStorageIds = await context.runQuery(internal.admin.clearDatabase.getBookStorageIds)
    deleted.bookCovers = await deleteStorageFiles(bookStorageIds, 'book covers')

    const seriesStorageIds = await context.runQuery(internal.admin.clearDatabase.getSeriesStorageIds)
    deleted.seriesCovers = await deleteStorageFiles(seriesStorageIds, 'series covers')

    const authorStorageIds = await context.runQuery(internal.admin.clearDatabase.getAuthorStorageIds)
    deleted.authorImages = await deleteStorageFiles(authorStorageIds, 'author images')

    const awardStorageIds = await context.runQuery(internal.admin.clearDatabase.getAwardStorageIds)
    deleted.awardImages = await deleteStorageFiles(awardStorageIds, 'award images')

    deleted.total = deleted.bookCovers + deleted.seriesCovers + deleted.authorImages + deleted.awardImages

    console.log('✅ All storage files deletion complete!', deleted)
    return { deleted }
  },
})
