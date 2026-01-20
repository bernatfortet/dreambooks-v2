'use node'

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB

export const downloadAwardImage = action({
  args: {
    awardId: v.id('awards'),
    sourceUrl: v.string(),
  },
  handler: async (context, args) => {
    console.log('🌀 Downloading award image', {
      awardId: args.awardId,
      sourceUrl: args.sourceUrl,
    })

    try {
      const response = await fetch(args.sourceUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} from ${args.sourceUrl}`)
      }

      // Validate content-type is image/*
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        throw new Error(`Award image URL did not return an image. content-type=${contentType}`)
      }

      // Validate size to avoid huge files
      const contentLengthHeader = response.headers.get('content-length')
      if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader)
        if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_BYTES) {
          throw new Error(`Award image too large: ${contentLength} bytes (max: ${MAX_IMAGE_BYTES})`)
        }
      }

      const blob = await response.blob()

      // Store in Convex
      const storageId = await context.storage.store(blob)

      // Update award record
      await context.runMutation(internal.awards.mutations.updateImageStorageId, {
        awardId: args.awardId,
        imageStorageId: storageId,
      })

      console.log('✅ Award image downloaded and stored', {
        awardId: args.awardId,
        storageId,
      })

      return { storageId }
    } catch (error) {
      console.error('❌ Error downloading award image', {
        awardId: args.awardId,
        sourceUrl: args.sourceUrl,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },
})
