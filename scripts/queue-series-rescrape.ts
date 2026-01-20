#!/usr/bin/env bun
/**
 * Queue all series for re-scraping (focused - no book/author discovery).
 *
 * Usage:
 *   bun scripts/queue-series-rescrape.ts            # Queue all series
 *   bun scripts/queue-series-rescrape.ts --dry-run  # Preview without queuing
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const CONVEX_URL = process.env.CONVEX_URL
if (!CONVEX_URL) {
  throw new Error('CONVEX_URL environment variable is not set')
}

const client = new ConvexHttpClient(CONVEX_URL)

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  console.log('🔄 Queue series for re-scraping')
  console.log(`   Dry run: ${dryRun}`)
  console.log('')

  const allSeries = await client.query(api.series.queries.list)
  console.log(`📚 Found ${allSeries.length} series\n`)

  let queued = 0
  let skipped = 0

  for (const series of allSeries) {
    console.log(`   ${series.name}`)
    console.log(`      sourceUrl: ${series.sourceUrl ?? 'none'}`)

    if (!series.sourceUrl) {
      console.log(`      ⏭️  Skipped (no sourceUrl)\n`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`      🏃 Would queue (dry run)\n`)
      queued++
      continue
    }

    try {
      await client.mutation(api.scrapeQueue.mutations.queueRescrape, {
        entityType: 'series',
        entityId: series._id,
        skipBookDiscoveries: true,
        skipAuthorDiscovery: true,
      })
      console.log(`      ✅ Queued\n`)
      queued++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(`      ❌ Failed: ${message}\n`)
    }
  }

  console.log('─'.repeat(40))
  console.log(`✅ Queued: ${queued}`)
  console.log(`⏭️  Skipped: ${skipped}`)
  console.log('')
  console.log('Run the worker to process: bun run worker')
}

main().catch((error) => {
  console.error('❌ Failed:', error)
  process.exit(1)
})
