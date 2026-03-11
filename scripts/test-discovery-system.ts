#!/usr/bin/env bunx tsx

/**
 * Test script for unified discovery system.
 *
 * Tests discovery extraction, queuing, and processor flows.
 *
 * Usage:
 *   bunx tsx scripts/test-discovery-system.ts
 */

import * as dotenv from 'dotenv'
import { discoverBookLinks } from '@/lib/scraping/domains/book/discover'
import { discoverSeriesLinks } from '@/lib/scraping/domains/series/discover'
import { discoverAuthorLinks } from '@/lib/scraping/domains/author/discover'
import { getConvexClient, queueDiscoveries } from './worker/convex'
import { api } from '@/convex/_generated/api'

dotenv.config({ path: '.env.local' })
dotenv.config()

const scrapeImportKey = process.env.SCRAPE_IMPORT_KEY
if (!scrapeImportKey) {
  throw new Error('SCRAPE_IMPORT_KEY environment variable is not set')
}

// Mock data for testing discovery extractors
const mockBookData = {
  title: 'Test Book',
  subtitle: null,
  authors: ['Author One', 'Author Two'],
  amazonAuthorIds: ['B000APEZHY', 'B000APFZHY'],
  contributors: [
    { name: 'Author One', amazonAuthorId: 'B000APEZHY', role: 'author' as const },
    { name: 'Author Two', amazonAuthorId: 'B000APFZHY', role: 'author' as const },
  ],
  isbn10: null,
  isbn13: null,
  asin: 'B012345678',
  publisher: null,
  publishedDate: null,
  pageCount: null,
  description: null,
  coverImageUrl: null,
  coverWidth: null,
  coverHeight: null,
  coverSourceFormat: null,
  coverSourceAsin: null,
  lexileScore: null,
  ageRangeMin: null,
  ageRangeMax: null,
  ageRangeRaw: null,
  gradeLevelMin: null,
  gradeLevelMax: null,
  gradeLevelRaw: null,
  seriesName: 'Test Series',
  seriesUrl: 'https://www.amazon.com/gp/series/B012345678',
  seriesPosition: 1,
  amazonRatingAverage: null,
  amazonRatingCount: null,
  goodreadsRatingAverage: null,
  goodreadsRatingCount: null,
  ratingScore: null,
  formats: [],
  editions: [],
  categories: [],
}

const mockSeriesData = {
  name: 'Test Series',
  description: 'A test series',
  totalBooks: 60,
  coverImageUrl: null,
  asin: null,
  books: Array.from({ length: 60 }, (_, i) => ({
    title: `Book ${i + 1}`,
    asin: `B${String(i).padStart(9, '0')}`,
    amazonUrl: `https://www.amazon.com/dp/B${String(i).padStart(9, '0')}`,
    position: i + 1,
    coverImageUrl: null,
    format: i % 5 === 0 ? ('audiobook' as const) : ('paperback' as const),
    authors: ['Author One'],
    authorLinks: [{ name: 'Author One', url: 'https://www.amazon.com/author/author-one' }],
  })),
  pagination: null,
}

const mockAuthorData = {
  name: 'Test Author',
  bio: 'A test author',
  imageUrl: null,
  amazonAuthorId: 'B000APEZHY',
  series: Array.from({ length: 25 }, (_, i) => ({
    name: `Series ${i + 1}`,
    amazonUrl: `https://www.amazon.com/gp/series/B${String(i).padStart(9, '0')}`,
    bookCount: 5,
  })),
  books: Array.from({ length: 40 }, (_, i) => ({
    title: `Book ${i + 1}`,
    asin: `B${String(i).padStart(9, '0')}`,
    amazonUrl: `https://www.amazon.com/dp/B${String(i).padStart(9, '0')}`,
    coverImageUrl: null,
  })),
}

async function testDiscoveryExtraction() {
  console.log('🧪 Testing Discovery Extraction\n')

  // Test 1: Book discovery
  console.log('Test 1.1: Book Discovery Extraction')
  const bookDiscoveries = discoverBookLinks(mockBookData)
  console.log(`   Found ${bookDiscoveries.length} discoveries`)

  const authorDiscoveries = bookDiscoveries.filter((d) => d.type === 'author')

  if (bookDiscoveries.some((d) => d.type === 'series')) {
    console.error('   ❌ FAILED: Book discovery should not queue series')
    return false
  }
  if (authorDiscoveries.length !== 2) {
    console.error(`   ❌ FAILED: Expected 2 author discoveries, got ${authorDiscoveries.length}`)
    return false
  }
  if (authorDiscoveries.some((d) => d.priority !== 40 || d.source !== 'book-author-link')) {
    console.error('   ❌ FAILED: Author discoveries have wrong priority/source')
    return false
  }
  console.log('   ✅ PASSED\n')

  // Test 2: Series discovery (capping)
  console.log('Test 1.2: Series Discovery Extraction (Capping)')
  const seriesDiscoveries = discoverSeriesLinks(mockSeriesData)
  console.log(`   Found ${seriesDiscoveries.length} discoveries (from ${mockSeriesData.books.length} books)`)

  if (seriesDiscoveries.length > 50) {
    console.error(`   ❌ FAILED: Discoveries not capped (got ${seriesDiscoveries.length}, max 50)`)
    return false
  }
  if (seriesDiscoveries.some((d) => d.priority !== 30 || d.source !== 'series-listing')) {
    console.error('   ❌ FAILED: Book discoveries have wrong priority/source')
    return false
  }
  // Check no audiobooks
  const audiobookCount = mockSeriesData.books.filter((b) => b.format === 'audiobook').length
  const nonAudiobookCount = mockSeriesData.books.length - audiobookCount
  if (seriesDiscoveries.length > nonAudiobookCount) {
    console.error('   ❌ FAILED: Audiobooks included in discoveries')
    return false
  }
  console.log('   ✅ PASSED\n')

  // Test 3: Author discovery (capping)
  console.log('Test 1.3: Author Discovery Extraction (Capping)')
  const authorPageDiscoveries = discoverAuthorLinks(mockAuthorData)
  console.log(`   Found ${authorPageDiscoveries.length} discoveries (${mockAuthorData.books.length} books)`)

  const seriesDisc = authorPageDiscoveries.filter((d) => d.type === 'series')
  const bookDisc = authorPageDiscoveries.filter((d) => d.type === 'book')

  if (seriesDisc.length !== 0) {
    console.error(`   ❌ FAILED: Author discovery should not queue series (got ${seriesDisc.length})`)
    return false
  }
  if (bookDisc.length !== mockAuthorData.books.length) {
    console.error(`   ❌ FAILED: Expected ${mockAuthorData.books.length} book discoveries, got ${bookDisc.length}`)
    return false
  }
  if (bookDisc.some((d) => d.priority !== 35 || d.source !== 'author-page')) {
    console.error('   ❌ FAILED: Book discoveries have wrong priority/source')
    return false
  }
  console.log('   ✅ PASSED\n')

  return true
}

async function testQueueIntegration() {
  console.log('🧪 Testing Queue Integration\n')

  const client = getConvexClient()

  // Test 2.1: Enqueue Discoveries (capping)
  console.log('Test 2.1: Enqueue Discoveries Mutation (Capping)')
  const manyDiscoveries = Array.from({ length: 100 }, (_, i) => ({
    type: 'book' as const,
    url: `https://www.amazon.com/dp/B${String(i).padStart(9, '0')}`,
    priority: 30,
    source: 'test',
  }))

  const queued = await queueDiscoveries(manyDiscoveries)
  console.log(`   Queued ${queued} discoveries (from ${manyDiscoveries.length} provided)`)

  if (queued > 50) {
    console.error(`   ❌ FAILED: Queue not capped (queued ${queued}, max 50)`)
    return false
  }
  console.log('   ✅ PASSED\n')

  // Test 2.2: Deduplication
  console.log('Test 2.2: Queue Deduplication')
  const testUrl = 'https://www.amazon.com/dp/B999999999'

  // Add URL manually first
  await client.mutation(api.scrapeQueue.mutations.enqueue, {
    apiKey: scrapeImportKey,
    url: testUrl,
    type: 'book',
    source: 'user',
  })

  // Try to queue same URL via discoveries
  const duplicateDiscoveries = [
    {
      type: 'book' as const,
      url: testUrl,
      priority: 30,
      source: 'test',
    },
  ]

  const queuedDuplicates = await queueDiscoveries(duplicateDiscoveries)
  console.log(`   Tried to queue duplicate, queued: ${queuedDuplicates}`)

  if (queuedDuplicates !== 0) {
    console.error('   ❌ FAILED: Duplicate was queued')
    return false
  }
  console.log('   ✅ PASSED\n')

  // Test 2.3: Source Field
  console.log('Test 2.3: Source Field')
  const userItem = await client.query(api.scrapeQueue.queries.listPending, { limit: 1 })
  if (userItem.length > 0 && userItem[0].source !== 'user') {
    console.error(`   ❌ FAILED: User item has wrong source: ${userItem[0].source}`)
    return false
  }

  // Check discovery items
  const discoveryItems = await client
    .query(api.scrapeQueue.queries.listPending, { limit: 10 })
    .then((items) => items.filter((item) => item.source === 'discovery'))

  if (discoveryItems.length > 0) {
    console.log(`   Found ${discoveryItems.length} discovery items with correct source`)
  }
  console.log('   ✅ PASSED\n')

  return true
}

async function main() {
  console.log('═'.repeat(60))
  console.log('🧪 DISCOVERY SYSTEM TEST SUITE')
  console.log('═'.repeat(60))
  console.log('')

  let allPassed = true

  // Test discovery extraction (no Convex needed)
  const extractionPassed = await testDiscoveryExtraction()
  allPassed = allPassed && extractionPassed

  // Test queue integration (needs Convex)
  try {
    const queuePassed = await testQueueIntegration()
    allPassed = allPassed && queuePassed
  } catch (error) {
    console.error('❌ Queue integration tests failed:', error)
    allPassed = false
  }

  console.log('═'.repeat(60))
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Run manual end-to-end test with worker')
    console.log('  2. Verify discoveries flow through queue correctly')
    console.log('  3. Proceed with migration if all checks pass')
  } else {
    console.log('❌ SOME TESTS FAILED')
    console.log('')
    console.log('Fix issues before proceeding with migration.')
  }
  console.log('═'.repeat(60))

  process.exit(allPassed ? 0 : 1)
}

main().catch((error) => {
  console.error('🚨 Test suite crashed:', error)
  process.exit(1)
})
