'use node'

import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { toHighResAmazonImageUrl, toMediumResAmazonImageUrl, toThumbResAmazonImageUrl } from './adapters/amazon/image'
import imageSize from 'image-size'
import * as jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

const MAX_COVER_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_COLOR_SAMPLES = 1000
const MIN_OPAQUE_ALPHA = 128

type DownloadResult = {
  storageId: Id<'_storage'>
  width: number | null
  height: number | null
  dominantColor?: string | null
} | null

type DownloadOptions = {
  computeDominantColor?: boolean
}

/**
 * Download and store an image from a URL.
 * Returns storage ID and actual measured dimensions, or null if failed.
 */
async function downloadAndStore(
  context: { storage: { store: (blob: Blob) => Promise<Id<'_storage'>> } },
  url: string,
  label: string,
  options: DownloadOptions = {},
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
    let dominantColor: string | null | undefined = undefined

    try {
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const dimensions = imageSize(buffer)
      width = dimensions.width ?? null
      height = dimensions.height ?? null
      console.log(`📐 ${label} dimensions measured`, { width, height, url })

      if (options.computeDominantColor) {
        dominantColor = (await extractDominantColorFromBuffer(buffer)) ?? undefined
        if (dominantColor) {
          console.log(`🎨 ${label} dominant color extracted`, { dominantColor, url })
        }
      }
    } catch (dimensionError) {
      console.log(`⚠️ ${label} dimension measurement failed`, { error: dimensionError, url })
    }

    return { storageId, width, height, ...(dominantColor !== undefined && { dominantColor }) }
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
        downloadAndStore(context, thumbResUrl, 'Thumb-res', { computeDominantColor: true }),
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

      const dominantColor = finalThumb?.dominantColor ?? null

      // Update book record with actual measured dimensions
      await context.runMutation(internal.books.mutations.updateCover, {
        bookId: args.bookId,
        coverStorageIdThumb: finalThumb!.storageId,
        coverStorageId: finalMedium!.storageId,
        coverStorageIdFull: finalFull!.storageId,
        coverBlurHash: undefined,
        coverDominantColor: dominantColor ?? undefined,
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

/**
 * Extract dominant (average) color from an image buffer using pure JS decoders.
 * Supports JPEG and PNG formats.
 */
async function extractDominantColorFromBuffer(buffer: Buffer): Promise<string | null> {
  try {
    const pixels = decodeImageToPixels(buffer)
    if (!pixels) return null

    return computeAverageColor(pixels)
  } catch {
    return null
  }
}

/**
 * Decode image buffer to raw RGBA pixel data.
 * Returns { data: Uint8Array, width, height } or null if unsupported format.
 */
function decodeImageToPixels(buffer: Buffer): { data: Uint8Array; width: number; height: number } | null {
  // Check for JPEG magic bytes (FFD8FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const decoded = jpeg.decode(buffer, { useTArray: true })
    return { data: decoded.data, width: decoded.width, height: decoded.height }
  }

  // Check for PNG magic bytes (89504E47)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    const png = PNG.sync.read(buffer)
    return { data: png.data, width: png.width, height: png.height }
  }

  return null
}

/**
 * Compute average color from RGBA pixel data by sampling every Nth pixel.
 */
function computeAverageColor(pixels: { data: Uint8Array; width: number; height: number }): string | null {
  const { data, width, height } = pixels
  const totalPixels = width * height

  // Sample every Nth pixel for performance (sample ~MAX_COLOR_SAMPLES pixels max)
  const sampleStep = Math.max(1, Math.floor(totalPixels / MAX_COLOR_SAMPLES))

  let r = 0
  let g = 0
  let b = 0
  let count = 0

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const alpha = data[i + 3]
    // Skip fully transparent pixels
    if (alpha < MIN_OPAQUE_ALPHA) continue

    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    count++
  }

  if (count === 0) return null

  const avgR = Math.round(r / count)
  const avgG = Math.round(g / count)
  const avgB = Math.round(b / count)

  return `#${[avgR, avgG, avgB].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
