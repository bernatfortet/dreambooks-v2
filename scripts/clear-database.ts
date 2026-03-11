#!/usr/bin/env bun

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convexUrl = process.env.CONVEX_URL
const scrapeImportKey = process.env.SCRAPE_IMPORT_KEY

if (!convexUrl) {
  console.error('❌ CONVEX_URL environment variable is not set')
  process.exit(1)
}

if (!scrapeImportKey) {
  console.error('❌ SCRAPE_IMPORT_KEY environment variable is not set')
  process.exit(1)
}

console.log('🗑️  Starting database clear (keeping awards)...')
console.log('⚠️  This will delete ALL books, series, authors, and related data!')
console.log('')

const client = new ConvexHttpClient(convexUrl)

try {
  const result = await client.action(api.admin.clearDatabase.clearAllExceptAwards, { apiKey: scrapeImportKey })

  console.log('')
  console.log('✅ Database clear complete!')
  console.log('')
  console.log('Deleted:')
  console.log(`  - Book Awards: ${result.deleted.bookAwards}`)
  console.log(`  - Book Authors: ${result.deleted.bookAuthors}`)
  console.log(`  - Books: ${result.deleted.books}`)
  console.log(`  - Series: ${result.deleted.series}`)
  console.log(`  - Authors: ${result.deleted.authors}`)
  console.log(`  - Scrape Queue: ${result.deleted.scrapeQueue}`)
  console.log(`  - Scrape Artifacts: ${result.deleted.scrapeArtifacts}`)
  console.log(`  - Book Scrape Runs: ${result.deleted.bookScrapeRuns}`)
  console.log(`  - Series Scrape Runs: ${result.deleted.seriesScrapeRuns}`)
  console.log('')
  console.log('Storage files deleted:')
  console.log(`  - Book Covers: ${result.deleted.bookCovers}`)
  console.log(`  - Series Covers: ${result.deleted.seriesCovers}`)
  console.log(`  - Author Images: ${result.deleted.authorImages}`)
  console.log('')
  console.log('Awards table preserved.')
} catch (error) {
  console.error('❌ Error clearing database:', error)
  process.exit(1)
}
