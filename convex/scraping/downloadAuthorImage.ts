'use node'

import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { toAmazonImageLongestSide } from './adapters/amazon/image'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB

type DownloadResult = {
  storageId: Id<'_storage'>
} | null

/**
 * Download and store an image from a URL.
 * Returns storage ID or null if failed.
 */
async function downloadAndStore(
  context: { storage: { store: (blob: Blob) => Promise<Id<'_storage'>> } },
  url: string,
  label: string,
): Promise<DownloadResult> {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      console.log(`⚠️ ${label} download failed`, { status: response.status, url })
      return null
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      console.log(`⚠️ ${label} not an image`, { contentType, url })
      return null
    }

    const contentLengthHeader = response.headers.get('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        console.log(`⚠️ ${label} too large`, { contentLength, url })
        return null
      }
    }

    const blob = await response.blob()
    const storageId = await context.storage.store(blob)

    console.log(`✅ ${label} downloaded and stored`, { storageId, url })
    return { storageId }
  } catch (error) {
    console.log(`⚠️ ${label} download error`, { error, url })
    return null
  }
}

export const downloadAuthorImage = internalAction({
  args: {
    authorId: v.id('authors'),
    sourceUrl: v.string(),
  },
  handler: async (context, args) => {
    // Get existing author to check for old images to delete
    const existingAuthor = await context.runQuery(internal.authors.queries.getInternal, {
      authorId: args.authorId,
    })
    const oldImageStorageIdThumb = existingAuthor?.image?.storageIdThumb
    const oldImageStorageIdMedium = existingAuthor?.image?.storageIdMedium
    const oldImageStorageIdLarge = existingAuthor?.image?.storageIdLarge

    // Transform to different resolutions
    const largeResUrl = toAmazonImageLongestSide(args.sourceUrl, 400)
    const mediumResUrl = toAmazonImageLongestSide(args.sourceUrl, 150)
    const thumbResUrl = toAmazonImageLongestSide(args.sourceUrl, 36)

    console.log('🌀 Downloading author images', {
      authorId: args.authorId,
      sourceUrl: args.sourceUrl,
      largeResUrl,
      mediumResUrl,
      thumbResUrl,
    })

    try {
      // Download all 3 sizes in parallel
      const [largeResult, mediumResult, thumbResult] = await Promise.all([
        downloadAndStore(context, largeResUrl, 'Large-res'),
        downloadAndStore(context, mediumResUrl, 'Medium-res'),
        downloadAndStore(context, thumbResUrl, 'Thumb-res'),
      ])

      // If all failed, try the original URL as fallback for medium
      let finalThumb = thumbResult
      let finalMedium = mediumResult
      let finalLarge = largeResult

      if (!finalMedium && !finalLarge && !finalThumb) {
        console.log('🔄 All sizes failed, trying original URL')
        finalMedium = await downloadAndStore(context, args.sourceUrl, 'Original')
      }

      // If we still have nothing, fail
      if (!finalMedium && !finalLarge && !finalThumb) {
        throw new Error('Failed to download any author image')
      }

      // Fallback cascade: use whatever we have for missing sizes
      // Priority: prefer medium as the fallback base
      const fallback = finalMedium ?? finalLarge ?? finalThumb
      if (!finalThumb) finalThumb = fallback
      if (!finalMedium) finalMedium = fallback
      if (!finalLarge) finalLarge = fallback

      // Update author record with all 3 storage IDs
      await context.runMutation(internal.authors.mutations.updateImage, {
        authorId: args.authorId,
        storageIdThumb: finalThumb!.storageId,
        storageIdMedium: finalMedium!.storageId,
        storageIdLarge: finalLarge!.storageId,
        sourceImageUrl: args.sourceUrl,
      })

      // Collect all new storage IDs to avoid deleting them
      const newStorageIds = new Set([finalThumb?.storageId, finalMedium?.storageId, finalLarge?.storageId].filter(Boolean))

      // Delete old images from storage to avoid orphans
      const oldStorageIds = [oldImageStorageIdThumb, oldImageStorageIdMedium, oldImageStorageIdLarge].filter(Boolean) as Id<'_storage'>[]
      const uniqueOldIds = [...new Set(oldStorageIds)]
      const toDelete = uniqueOldIds.filter((id) => !newStorageIds.has(id))

      for (const storageId of toDelete) {
        try {
          await context.storage.delete(storageId)
          console.log('🗑️ Deleted old author image from storage', { storageId })
        } catch (error) {
          console.log('⚠️ Failed to delete old author image', { storageId, error })
        }
      }

      console.log('✅ Author images downloaded and stored', {
        authorId: args.authorId,
        thumbStorageId: finalThumb!.storageId,
        mediumStorageId: finalMedium!.storageId,
        largeStorageId: finalLarge!.storageId,
      })
    } catch (error) {
      console.log('🚨 Author image download failed', { authorId: args.authorId, error })
    }
  },
})
