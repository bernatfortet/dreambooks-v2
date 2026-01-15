import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { toHighResAmazonImageUrl } from './adapters/amazon/image'

const MAX_COVER_BYTES = 10 * 1024 * 1024 // 10MB

export const downloadCover = internalAction({
  args: {
    bookId: v.id('books'),
    sourceUrl: v.string(),
  },
  handler: async (context, args) => {
    // Transform to high-res URL if it's an Amazon image
    const highResUrl = toHighResAmazonImageUrl(args.sourceUrl)

    console.log('🌀 Downloading cover image', {
      bookId: args.bookId,
      originalUrl: args.sourceUrl,
      highResUrl,
    })

    try {
      // Download image (hardened) - try high-res first, fallback to original
      let response = await fetch(highResUrl)
      let usedUrl = highResUrl

      if (!response.ok && highResUrl !== args.sourceUrl) {
        console.log('🔄 High-res failed, trying original URL', { status: response.status })
        response = await fetch(args.sourceUrl)
        usedUrl = args.sourceUrl
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} from ${usedUrl}`)
      }

      // Validate content-type is image/*
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        throw new Error(`Cover URL did not return an image. content-type=${contentType}`)
      }

      // Validate size to avoid huge files
      const contentLengthHeader = response.headers.get('content-length')
      if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader)
        if (!Number.isNaN(contentLength) && contentLength > MAX_COVER_BYTES) {
          throw new Error(`Cover image too large: ${contentLength} bytes (max: ${MAX_COVER_BYTES})`)
        }
      }

      const blob = await response.blob()

      // Store in Convex
      const storageId = await context.storage.store(blob)

      // Generate blurhash (skipped for MVP - would need sharp)
      const blurHash = undefined

      // Update book record
      await context.runMutation(internal.books.mutations.updateCover, {
        bookId: args.bookId,
        coverStorageId: storageId,
        coverBlurHash: blurHash,
        coverStatus: 'complete',
      })

      console.log('✅ Cover downloaded and stored', { bookId: args.bookId, storageId })
    } catch (error) {
      console.log('🚨 Cover download failed', { bookId: args.bookId, error })

      await context.runMutation(internal.books.mutations.updateStatus, {
        bookId: args.bookId,
        coverStatus: 'error',
        errorMessage: error instanceof Error ? error.message : 'Cover download failed',
      })
    }
  },
})
