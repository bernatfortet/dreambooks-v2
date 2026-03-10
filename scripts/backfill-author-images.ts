#!/usr/bin/env bun

/**
 * Backfill author images for existing authors that have `image.sourceImageUrl`
 * but no stored image yet.
 *
 * Usage:
 *   bun scripts/backfill-author-images.ts            # Process 50 authors (default)
 *   bun scripts/backfill-author-images.ts --limit 100 # Process 100 authors
 *   bun scripts/backfill-author-images.ts --all       # Process all authors in batches
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convexUrl = process.env.CONVEX_URL
if (!convexUrl) {
  throw new Error('CONVEX_URL environment variable is not set')
}

const client = new ConvexHttpClient(convexUrl)

async function backfillAuthorImages() {
  const args = process.argv.slice(2)
  const limitArg = args.find((arg) => arg.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50
  const processAll = args.includes('--all')

  console.log('🔄 Starting author image backfill...\n')

  let totalScheduled = 0
  let batchCount = 0

  do {
    batchCount++
    console.log(`📦 Batch ${batchCount}: Processing up to ${limit} authors...`)

    const result = await client.action(api.scraping.backfillAuthorImages.backfillAuthorImagesPublic, {
      limit,
    })

    totalScheduled += result.scheduled
    console.log(`   ✅ Scheduled ${result.scheduled} image downloads\n`)

    if (result.scheduled === 0) {
      console.log('✅ No more authors need image backfill!')
      break
    }

    if (processAll && result.scheduled === limit) {
      // Wait a bit before next batch to avoid overwhelming the scheduler
      console.log('   ⏳ Waiting 2 seconds before next batch...\n')
      await new Promise((resolve) => setTimeout(resolve, 2000))
    } else if (!processAll) {
      break
    }
  } while (processAll)

  console.log(`\n✨ Backfill complete!`)
  console.log(`   Total scheduled: ${totalScheduled} image downloads`)
  console.log(`   Batches processed: ${batchCount}`)
  console.log(`\n   Note: Images will be downloaded asynchronously via scheduled actions.`)
  console.log(`   Check Convex logs to monitor download progress.`)
}

backfillAuthorImages().catch((error) => {
  console.error('❌ Backfill failed:', error)
  process.exit(1)
})
