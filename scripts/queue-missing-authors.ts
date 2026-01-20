#!/usr/bin/env bunx tsx

/**
 * Script to queue missing authors for scraping.
 *
 * Identifies books with amazonAuthorIds that don't have corresponding author records
 * in the database, then queues those authors for scraping.
 *
 * Usage:
 *   bunx tsx scripts/queue-missing-authors.ts            # Show summary
 *   bunx tsx scripts/queue-missing-authors.ts --dry-run  # Preview what would be queued
 *   bunx tsx scripts/queue-missing-authors.ts --queue   # Actually queue the authors
 */

import * as dotenv from 'dotenv'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { buildAuthorUrl } from '@/lib/scraping/utils/amazon-url'
import { toSlug } from '@/lib/scraping/utils/slug'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'

dotenv.config({ path: '.env.local' })
dotenv.config()

async function main() {
  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }

  const client = new ConvexHttpClient(convexUrl)

  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const shouldQueue = args.includes('--queue')

  console.log('═'.repeat(60))
  console.log('📚 MISSING AUTHORS AUDIT')
  console.log('═'.repeat(60))
  console.log('')

  // Get summary and missing author IDs in a single call
  console.log('📈 Fetching data...\n')

  const result = await client.query(api.admin.missingAuthors.getMissingAuthorIds, {})
  const summary = result.summary
  const missingAuthors = result.missingAuthors

  console.log(`   Total books: ${summary.totalBooks.toLocaleString()}`)
  console.log(`   Books with amazonAuthorIds: ${summary.booksWithAuthorIds.toLocaleString()}`)
  console.log(`   Books without amazonAuthorIds: ${summary.booksWithoutAuthorIds.toLocaleString()} (may need re-scraping)`)
  console.log('')
  console.log(`   Unique author IDs found: ${summary.uniqueAuthorIdsFound.toLocaleString()}`)
  console.log(`   Authors in database: ${summary.authorsInDatabase.toLocaleString()}`)
  console.log(`   Missing authors: ${summary.missingAuthorIds.toLocaleString()}`)
  console.log('')

  if (!shouldQueue && !isDryRun) {
    console.log('═'.repeat(60))
    console.log('')
    console.log('Options:')
    console.log('  --dry-run   Preview which authors would be queued')
    console.log('  --queue     Add missing authors to scrape queue')
    console.log('')
    console.log('Example:')
    console.log('  bunx tsx scripts/queue-missing-authors.ts --dry-run')
    console.log('  bunx tsx scripts/queue-missing-authors.ts --queue')
    console.log('')
    return
  }

  console.log('═'.repeat(60))
  console.log('')

  if (summary.missingAuthorIds === 0) {
    console.log('✅ No missing authors found! All books have their authors scraped.')
    console.log('')
    return
  }

  if (isDryRun) {
    console.log('🔍 Running dry run...\n')
    console.log(`   Would queue ${missingAuthors.length.toLocaleString()} authors:`)
    console.log('')

    // Show first 20 as examples
    const samples = missingAuthors.slice(0, 20)
    for (const author of samples) {
      const slug = author.authorName ? toSlug(author.authorName) : null
      const url = buildAuthorUrl(author.authorId, slug)
      const name = author.authorName || '(unknown name)'
      console.log(`     - ${name} (${author.authorId})`)
      console.log(`       URL: ${url}`)
      console.log(`       Sample book: "${author.sampleBookTitle}"`)
      console.log('')
    }

    if (missingAuthors.length > 20) {
      console.log(`   ... and ${(missingAuthors.length - 20).toLocaleString()} more`)
      console.log('')
    }
  } else if (shouldQueue) {
    console.log('🚀 Queuing missing authors...\n')

    // Build discoveries array
    const discoveries = missingAuthors.map((author) => {
      const slug = author.authorName ? toSlug(author.authorName) : null
      const url = buildAuthorUrl(author.authorId, slug)

      return {
        type: 'author' as const,
        url,
        priority: SCRAPING_CONFIG.priorities.authorFromBook,
        source: 'backfill-script',
        metadata: author.authorName
          ? {
              name: author.authorName,
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
        discoveries: batch,
      })
      totalQueued += queued

      console.log(`   Queued batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(discoveries.length / batchSize)}: ${queued} authors`)
    }

    console.log('')
    console.log(`   ✅ Queued ${totalQueued.toLocaleString()} authors`)
    console.log(`   ⚠️  Skipped ${(discoveries.length - totalQueued).toLocaleString()} (already in queue or duplicates)`)
  }

  console.log('')
  console.log('═'.repeat(60))
}

main().catch((error) => {
  console.error('🚨 Script failed:', error)
  process.exit(1)
})
