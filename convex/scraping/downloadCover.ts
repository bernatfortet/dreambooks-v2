'use node'

import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { toHighResAmazonImageUrl, toMediumResAmazonImageUrl, toThumbResAmazonImageUrl } from './adapters/amazon/image'
import imageSize from 'image-size'

const MAX_COVER_BYTES = 10 * 1024 * 1024 // 10MB

type DownloadResult = {
  storageId: Id<'_storage'>
  width: number | null
  height: number | null
} | null

/**
 * Download and store an image from a URL.
 * Returns storage ID and actual measured dimensions, or null if failed.
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
      if (!Number.isNaN(contentLength) && contentLength > MAX_COVER_BYTES) {
        console.log(`⚠️ ${label} too large`, { contentLength, url })
        return null
      }
    }

    const blob = await response.blob()
    const storageId = await context.storage.store(blob)

    // Measure actual image dimensions from the blob
    let width: number | null = null
    let height: number | null = null

    try {
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const dimensions = imageSize(buffer)
      width = dimensions.width ?? null
      height = dimensions.height ?? null
      console.log(`📐 ${label} dimensions measured`, { width, height, url })
    } catch (dimensionError) {
      console.log(`⚠️ ${label} dimension measurement failed`, { error: dimensionError, url })
    }

    return { storageId, width, height }
  } catch (error) {
    console.log(`⚠️ ${label} download error`, { error, url })
    return null
  }
}

export const downloadCover = internalAction({
  args: {
    bookId: v.id('books'),
    sourceUrl: v.string(),
  },
  handler: async (context, args) => {
    // Get existing book to check for old covers to delete
    const existingBook = await context.runQuery(internal.books.queries.getInternal, { id: args.bookId })
    const oldCoverStorageIdThumb = existingBook?.cover?.storageIdThumb
    const oldCoverStorageId = existingBook?.cover?.storageIdMedium
    const oldCoverStorageIdFull = existingBook?.cover?.storageIdFull

    // Transform to different resolutions
    const fullResUrl = toHighResAmazonImageUrl(args.sourceUrl)
    const mediumResUrl = toMediumResAmazonImageUrl(args.sourceUrl)
    const thumbResUrl = toThumbResAmazonImageUrl(args.sourceUrl)

    console.log('🌀 Downloading cover images', {
      bookId: args.bookId,
      sourceUrl: args.sourceUrl,
      fullResUrl,
      mediumResUrl,
      thumbResUrl,
    })

    try {
      // Download all 3 sizes in parallel
      const [fullResult, mediumResult, thumbResult] = await Promise.all([
        downloadAndStore(context, fullResUrl, 'Full-res'),
        downloadAndStore(context, mediumResUrl, 'Medium-res'),
        downloadAndStore(context, thumbResUrl, 'Thumb-res'),
      ])

      // If all failed, try the original URL as fallback for medium
      let finalThumb = thumbResult
      let finalMedium = mediumResult
      let finalFull = fullResult

      if (!finalMedium && !finalFull && !finalThumb) {
        console.log('🔄 All sizes failed, trying original URL')
        finalMedium = await downloadAndStore(context, args.sourceUrl, 'Original')
      }

      // If we still have nothing, fail
      if (!finalMedium && !finalFull && !finalThumb) {
        throw new Error('Failed to download any cover image')
      }

      // Fallback cascade: use whatever we have for missing sizes
      // Priority: prefer medium as the fallback base
      const fallback = finalMedium ?? finalFull ?? finalThumb
      if (!finalThumb) finalThumb = fallback
      if (!finalMedium) finalMedium = fallback
      if (!finalFull) finalFull = fallback

      // Use dimensions from the full-res image (what we display on detail pages)
      // Fall back to medium if full-res dimensions aren't available
      const width = finalFull?.width ?? finalMedium?.width ?? null
      const height = finalFull?.height ?? finalMedium?.height ?? null

      console.log('📐 Final cover dimensions to store', { width, height, bookId: args.bookId })

      // Update book record with actual measured dimensions
      await context.runMutation(internal.books.mutations.updateCover, {
        bookId: args.bookId,
        coverStorageIdThumb: finalThumb!.storageId,
        coverStorageId: finalMedium!.storageId,
        coverStorageIdFull: finalFull!.storageId,
        coverBlurHash: undefined,
        coverStatus: 'complete',
        width: width ?? undefined,
        height: height ?? undefined,
      })

      // Collect all new storage IDs to avoid deleting them
      const newStorageIds = new Set([finalThumb?.storageId, finalMedium?.storageId, finalFull?.storageId].filter(Boolean))

      // Delete old covers from storage to avoid orphans
      const oldStorageIds = [oldCoverStorageIdThumb, oldCoverStorageId, oldCoverStorageIdFull].filter(Boolean) as Id<'_storage'>[]
      const uniqueOldIds = [...new Set(oldStorageIds)]
      const toDelete = uniqueOldIds.filter((id) => !newStorageIds.has(id))

      for (const storageId of toDelete) {
        try {
          await context.storage.delete(storageId)
          console.log('🗑️ Deleted old cover from storage', { storageId })
        } catch (error) {
          console.log('⚠️ Failed to delete old cover', { storageId, error })
        }
      }

      console.log('✅ Covers downloaded and stored', {
        bookId: args.bookId,
        thumbStorageId: finalThumb!.storageId,
        mediumStorageId: finalMedium!.storageId,
        fullStorageId: finalFull!.storageId,
        width,
        height,
      })
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
