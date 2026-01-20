'use node'

import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { toHighResAmazonImageUrl } from './adapters/amazon/image'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB

export const downloadAuthorImage = internalAction({
  args: {
    authorId: v.id('authors'),
    sourceUrl: v.string(),
  },
  handler: async (context, args) => {
    const existingAuthor = await context.runQuery(internal.authors.queries.getInternal, {
      authorId: args.authorId,
    })
    const oldImageStorageId = existingAuthor?.imageStorageId
    const highResUrl = toHighResAmazonImageUrl(args.sourceUrl)

    console.log('🌀 Downloading author image', {
      authorId: args.authorId,
      originalUrl: args.sourceUrl,
      highResUrl,
      hasOldImage: !!oldImageStorageId,
    })

    try {
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

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        throw new Error(`Author image URL did not return an image. content-type=${contentType}`)
      }

      const contentLengthHeader = response.headers.get('content-length')
      if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader)
        if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_BYTES) {
          throw new Error(`Author image too large: ${contentLength} bytes (max: ${MAX_IMAGE_BYTES})`)
        }
      }

      const blob = await response.blob()
      const storageId = await context.storage.store(blob)

      await context.runMutation(internal.authors.mutations.updateImageStorageId, {
        authorId: args.authorId,
        imageStorageId: storageId,
      })

      if (oldImageStorageId && oldImageStorageId !== storageId) {
        try {
          await context.storage.delete(oldImageStorageId)
          console.log('🗑️ Deleted old author image from storage', { oldImageStorageId })
        } catch (error) {
          console.log('⚠️ Failed to delete old author image', { oldImageStorageId, error })
        }
      }

      console.log('✅ Author image downloaded and stored', {
        authorId: args.authorId,
        storageId,
        replacedOld: !!oldImageStorageId,
      })
    } catch (error) {
      console.log('🚨 Author image download failed', { authorId: args.authorId, error })
    }
  },
})
