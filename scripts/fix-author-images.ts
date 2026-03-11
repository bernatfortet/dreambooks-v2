#!/usr/bin/env bun

/**
 * Fix author images by clearing bad banner images and optionally re-scraping.
 *
 * This script identifies authors with the incorrect Amazon banner image
 * (Author_Store_Banner) and clears their image data. Optionally queues them
 * for re-scraping with the fixed image extraction logic.
 *
 * Usage:
 *   bun scripts/fix-author-images.ts                    # Show summary
 *   bun scripts/fix-author-images.ts --dry-run         # Preview what would be fixed
 *   bun scripts/fix-author-images.ts --clear           # Clear bad image data
 *   bun scripts/fix-author-images.ts --clear --queue   # Clear and queue for re-scraping
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { buildAuthorUrl } from '@/lib/scraping/utils/amazon-url'
import { toSlug } from '@/lib/scraping/utils/slug'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'

const convexUrl = process.env.CONVEX_URL
if (!convexUrl) {
  throw new Error('CONVEX_URL environment variable is not set')
}

const scrapeImportKey = process.env.SCRAPE_IMPORT_KEY
if (!scrapeImportKey) {
  throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
}

const client = new ConvexHttpClient(convexUrl)

// Known bad image URLs that should be cleared
const BAD_IMAGE_PATTERNS = ['Author_Store_Banner', 'author-cx', 'grey-pixel', 'transparent-pixel', 'amazon-avatars-global/default']

function hasBadImage(author: { image?: { sourceImageUrl?: string | null } | null }): boolean {
  const sourceImageUrl = author.image?.sourceImageUrl
  if (!sourceImageUrl) return false

  return BAD_IMAGE_PATTERNS.some((pattern) => sourceImageUrl.includes(pattern))
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const shouldClear = args.includes('--clear')
  const shouldQueue = args.includes('--queue')

  console.log('═'.repeat(60))
  console.log('🖼️  FIX AUTHOR IMAGES')
  console.log('═'.repeat(60))
  console.log('')

  // Get all authors
  console.log('📈 Fetching authors...\n')
  const authors = await client.query(api.authors.queries.list)

  // Find authors with bad images
  const authorsWithBadImages = authors.filter(hasBadImage)

  console.log(`   Total authors: ${authors.length.toLocaleString()}`)
  console.log(`   Authors with bad images: ${authorsWithBadImages.length.toLocaleString()}`)
  console.log('')

  if (authorsWithBadImages.length === 0) {
    console.log('✅ No authors with bad images found!')
    console.log('')
    return
  }

  if (!shouldClear && !isDryRun) {
    console.log('═'.repeat(60))
    console.log('')
    console.log('Options:')
    console.log('  --dry-run   Preview which authors would be fixed')
    console.log('  --clear      Clear bad image data from authors')
    console.log('  --queue     Queue authors for re-scraping (use with --clear)')
    console.log('')
    console.log('Examples:')
    console.log('  bun scripts/fix-author-images.ts --dry-run')
    console.log('  bun scripts/fix-author-images.ts --clear')
    console.log('  bun scripts/fix-author-images.ts --clear --queue')
    console.log('')
    return
  }

  console.log('═'.repeat(60))
  console.log('')

  if (isDryRun) {
    console.log('🔍 Running dry run...\n')
    console.log(`   Would clear image data from ${authorsWithBadImages.length.toLocaleString()} authors:\n`)

    // Show first 20 as examples
    const samples = authorsWithBadImages.slice(0, 20)
    for (const author of samples) {
      console.log(`     - ${author.name}`)
      console.log(`       Current image: ${author.image?.sourceImageUrl?.substring(0, 80)}...`)
      console.log('')
    }

    if (authorsWithBadImages.length > 20) {
      console.log(`   ... and ${(authorsWithBadImages.length - 20).toLocaleString()} more`)
      console.log('')
    }
  } else if (shouldClear) {
    console.log('🧹 Clearing bad image data...\n')

    let cleared = 0
    let errors = 0

    for (const author of authorsWithBadImages) {
      try {
        await client.mutation(api.authors.mutations.clearImageData, {
          authorId: author._id,
        })
        cleared++

        if (cleared % 10 === 0) {
          console.log(`   ✅ Cleared ${cleared}/${authorsWithBadImages.length}...`)
        }
      } catch (error) {
        console.error(`   ❌ Error clearing image for ${author.name}:`, error)
        errors++
      }
    }

    console.log('')
    console.log(`   ✅ Cleared image data from ${cleared.toLocaleString()} authors`)
    if (errors > 0) {
      console.log(`   ⚠️  Errors: ${errors}`)
    }
    console.log('')

    if (shouldQueue) {
      console.log('🚀 Queuing authors for re-scraping...\n')

      // First, delete any existing queue items for these authors to allow re-queuing
      console.log('   Clearing existing queue items...')
      let deletedCount = 0
      for (const author of authorsWithBadImages) {
        const slug = author.name ? toSlug(author.name) : null
        const url = author.sourceUrl || buildAuthorUrl(author.amazonAuthorId, slug)
        const deleted = await client.mutation(api.scrapeQueue.mutations.deleteQueueItems, { url })
        deletedCount += deleted
      }
      console.log(`   ✅ Deleted ${deletedCount} existing queue items\n`)

      // Build discoveries array
      const discoveries = authorsWithBadImages.map((author) => {
        const slug = author.name ? toSlug(author.name) : null
        const url = author.sourceUrl || buildAuthorUrl(author.amazonAuthorId, slug)

        return {
          type: 'author' as const,
          url,
          priority: SCRAPING_CONFIG.priorities.authorFromBook,
          source: 'fix-author-images-script',
          metadata: author.name
            ? {
                name: author.name,
              }
            : undefined,
        }
      })

      // Batch discoveries (max 50 per call)
      const batchSize = SCRAPING_CONFIG.queue.maxDiscoveriesPerCall
      let totalQueued = 0

      for (let i = 0; i < discoveries.length; i += batchSize) {
        const batch = discoveries.slice(i, i + batchSize)
        const queued = await client.mutation(api.scrapeQueue.mutations.enqueueDiscoveries, {
            apiKey: scrapeImportKey,
          discoveries: batch,
        })
        totalQueued += queued

        console.log(`   Queued batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(discoveries.length / batchSize)}: ${queued} authors`)
      }

      console.log('')
      console.log(`   ✅ Queued ${totalQueued.toLocaleString()} authors for re-scraping`)
      if (totalQueued < discoveries.length) {
        console.log(`   ⚠️  Skipped ${(discoveries.length - totalQueued).toLocaleString()} (already in queue)`)
      }
      console.log('')
    }
  }

  console.log('═'.repeat(60))
}

main().catch((error) => {
  console.error('🚨 Script failed:', error)
  process.exit(1)
})
