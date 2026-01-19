import { action } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'

/**
 * Enrich a basic book by scraping its Amazon page for full details.
 * On-demand single-book enrichment.
 */
export const enrichBook = action({
  args: {
    bookId: v.id('books'),
  },
  handler: async (context, args): Promise<{ bookId: Id<'books'> }> => {
    console.log('🏁 Enriching book', { bookId: args.bookId })

    // Load book
    const book = await context.runQuery(internal.books.queries.getInternal, {
      id: args.bookId,
    })

    if (!book) {
      throw new Error('Book not found')
    }

    if (!book.amazonUrl) {
      throw new Error('Book has no Amazon URL - cannot enrich')
    }

    // Set status to queued (transition state)
    await context.runMutation(internal.books.mutations.updateStatus, {
      bookId: args.bookId,
      detailsStatus: 'queued',
    })

    try {
      // Use existing crawlBook pipeline
      const enrichedBookId = await context.runAction(api.scraping.crawlBook.crawlBook, {
        url: book.amazonUrl,
      })

      // Ensure we're updating the same book (idempotency via ASIN/ISBN13)
      if (enrichedBookId !== args.bookId) {
        console.log('⚠️ crawlBook returned different bookId - this should not happen', {
          requested: args.bookId,
          returned: enrichedBookId,
        })
      }

      // The crawlBook action sets detailsStatus to 'complete' via upsertFromScrape
      // But we should verify it's set correctly
      const updatedBook = await context.runQuery(internal.books.queries.getInternal, {
        id: args.bookId,
      })

      if (updatedBook && updatedBook.detailsStatus !== 'complete') {
        // Fallback: explicitly set to complete if crawlBook didn't
        await context.runMutation(internal.books.mutations.updateStatus, {
          bookId: args.bookId,
          detailsStatus: 'complete',
        })
      }

      console.log('✅ Book enriched', { bookId: args.bookId })

      return { bookId: args.bookId }
    } catch (error) {
      console.log('🚨 Book enrichment failed', { bookId: args.bookId, error })

      await context.runMutation(internal.books.mutations.updateStatus, {
        bookId: args.bookId,
        detailsStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })

      throw error
    }
  },
})
