#!/usr/bin/env bun

/**
 * Backfill series covers for existing series that have coverSourceUrl
 * but no coverStorageId.
 *
 * Usage:
 *   bun scripts/backfill-series-covers.ts            # Process 50 series (default)
 *   bun scripts/backfill-series-covers.ts --limit=100 # Process 100 series
 *   bun scripts/backfill-series-covers.ts --all       # Process all series in batches
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convexUrl = process.env.CONVEX_URL
if (!convexUrl) {
  throw new Error('CONVEX_URL environment variable is not set')
}

const client = new ConvexHttpClient(convexUrl)

async function backfillSeriesCovers() {
  const args = process.argv.slice(2)
  const limitArg = args.find((arg) => arg.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50
  const processAll = args.includes('--all')

  console.log('🔄 Starting series cover backfill...\n')

  let totalScheduled = 0
  let batchCount = 0

  do {
    batchCount++
    console.log(`📦 Batch ${batchCount}: Processing up to ${limit} series...`)

    const result = await client.action(api.scraping.backfillSeriesCovers.backfillSeriesCoversPublic, {
      limit,
    })

    totalScheduled += result.scheduled
    console.log(`   ✅ Scheduled ${result.scheduled} cover downloads\n`)

    if (result.scheduled === 0) {
      console.log('✅ No more series need cover backfill!')
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
  console.log(`   Total scheduled: ${totalScheduled} cover downloads`)
  console.log(`   Batches processed: ${batchCount}`)
  console.log(`\n   Note: Covers will be downloaded asynchronously via scheduled actions.`)
  console.log(`   Check Convex logs to monitor download progress.`)
}

backfillSeriesCovers().catch((error) => {
  console.error('❌ Backfill failed:', error)
  process.exit(1)
})
