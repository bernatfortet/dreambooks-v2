import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { toHighResAmazonImageUrl } from './adapters/amazon/image'

const MAX_COVER_BYTES = 10 * 1024 * 1024 // 10MB

export const downloadSeriesCover = internalAction({
  args: {
    seriesId: v.id('series'),
    sourceUrl: v.string(),
  },
  handler: async (context, args) => {
    // Transform to high-res URL if it's an Amazon image
    const highResUrl = toHighResAmazonImageUrl(args.sourceUrl)

    console.log('🌀 Downloading series cover image', {
      seriesId: args.seriesId,
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

      // Update series record
      await context.runMutation(internal.series.mutations.updateCover, {
        seriesId: args.seriesId,
        coverStorageId: storageId,
      })

      console.log('✅ Series cover downloaded and stored', { seriesId: args.seriesId, storageId })
    } catch (error) {
      console.log('🚨 Series cover download failed', { seriesId: args.seriesId, error })
      // Note: We don't have an error status field for series covers, so we just log it
    }
  },
})
