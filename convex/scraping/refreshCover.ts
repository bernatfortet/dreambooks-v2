import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Doc } from '../_generated/dataModel'
import { requireSuperadmin } from '../lib/superadmin'

/**
 * Force re-download cover from existing cover.sourceUrl.
 * Use this when the stored image doesn't match the URL (historical data issue).
 */
export const forceDownloadCover = action({
  args: { bookId: v.id('books') },
  returns: v.object({
    scheduled: v.boolean(),
    coverSourceUrl: v.string(),
  }),
  handler: async (context, args): Promise<{ scheduled: boolean; coverSourceUrl: string }> => {
    await requireSuperadmin(context)

    console.log('🔄 Force re-downloading cover', { bookId: args.bookId })

    const book: Doc<'books'> | null = await context.runQuery(internal.books.queries.getInternal, { id: args.bookId })

    if (!book) {
      throw new Error('Book not found')
    }

    const sourceUrl = book.cover?.sourceUrl
    if (!sourceUrl) {
      throw new Error('Book has no cover.sourceUrl - needs to be scraped first')
    }

    console.log('📥 Scheduling cover download', {
      bookId: args.bookId,
      coverSourceUrl: sourceUrl,
      hasExistingCover: !!book.cover?.storageIdMedium,
    })

    // Schedule download - downloadCover will handle deleting old storage
    await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
      bookId: args.bookId,
      sourceUrl,
    })

    return { scheduled: true, coverSourceUrl: sourceUrl }
  },
})
