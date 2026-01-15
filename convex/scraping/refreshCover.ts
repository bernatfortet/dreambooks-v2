'use node'

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import FirecrawlApp from '@mendable/firecrawl-js'

// Simple schema just for cover extraction
const coverSchema = {
  type: 'object',
  properties: {
    coverImageUrl: {
      type: 'string',
      description: 'Highest resolution book cover image URL',
    },
  },
  required: ['coverImageUrl'],
}

export const refreshCoverFromAmazon = action({
  args: { bookId: v.id('books') },
  handler: async (context, args) => {
    console.log('🔄 Refreshing cover from Amazon', { bookId: args.bookId })

    // Get book's Amazon URL
    const book = await context.runQuery(internal.books.queries.getInternal, { id: args.bookId })

    if (!book) {
      throw new Error('Book not found')
    }

    if (!book.amazonUrl) {
      throw new Error('Book has no Amazon URL')
    }

    // Mark cover as pending
    await context.runMutation(internal.books.mutations.updateStatus, {
      bookId: args.bookId,
      coverStatus: 'pending',
    })

    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) throw new Error('FIRECRAWL_API_KEY not set')

    const firecrawl = new FirecrawlApp({ apiKey })

    console.log('🌀 Extracting cover URL from Amazon', { url: book.amazonUrl })

    const result = await firecrawl.extract({
      urls: [book.amazonUrl],
      schema: coverSchema,
      prompt: 'Extract the highest resolution book cover image URL from this Amazon product page. Look for the main product image, not thumbnails.',
    })

    if (!result.success || !result.data) {
      console.log('🚨 Cover extraction failed', { error: result.error })

      await context.runMutation(internal.books.mutations.updateStatus, {
        bookId: args.bookId,
        coverStatus: 'error',
        errorMessage: `Cover extraction failed: ${result.error}`,
      })

      throw new Error(`Cover extraction failed: ${result.error}`)
    }

    const data = result.data as { coverImageUrl?: string }

    if (!data.coverImageUrl) {
      await context.runMutation(internal.books.mutations.updateStatus, {
        bookId: args.bookId,
        coverStatus: 'error',
        errorMessage: 'No cover URL found',
      })

      throw new Error('No cover URL found')
    }

    console.log('✅ Cover URL extracted', { coverImageUrl: data.coverImageUrl })

    // Schedule download (will transform to high-res)
    await context.scheduler.runAfter(0, internal.scraping.downloadCover.downloadCover, {
      bookId: args.bookId,
      sourceUrl: data.coverImageUrl,
    })

    return { coverImageUrl: data.coverImageUrl }
  },
})
