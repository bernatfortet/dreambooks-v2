#!/usr/bin/env bun
/**
 * Script to scrape a series using Playwright locally and save to Convex.
 * Usage: bun scripts/scrape-series.ts <seriesId|seriesUrl>
 *
 * Examples:
 *   bun scripts/scrape-series.ts jd735x8qbew8898davr9scknkd7z9kxc
 *   bun scripts/scrape-series.ts "https://www.amazon.com/dp/B08MW1GWF9"
 */

import { ConvexHttpClient } from 'convex/browser'
import { api, internal } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { scrapeSeries } from '@/lib/scraping/domains/series'

const CONVEX_URL = process.env.CONVEX_URL || 'https://abundant-bee-200.convex.cloud'
const SCRAPE_IMPORT_KEY = process.env.SCRAPE_IMPORT_KEY

async function main() {
  const input = process.argv[2]
  const headless = !process.argv.includes('--headed')

  if (!input) {
    console.error('Usage: bun scripts/scrape-series.ts <seriesId|seriesUrl> [--headed]')
    console.error('')
    console.error('Examples:')
    console.error('  bun scripts/scrape-series.ts jd735x8qbew8898davr9scknkd7z9kxc')
    console.error('  bun scripts/scrape-series.ts "https://www.amazon.com/dp/B08MW1GWF9"')
    console.error('  bun scripts/scrape-series.ts "https://www.amazon.com/dp/B08MW1GWF9" --headed')
    process.exit(1)
  }

  console.log('🏁 Starting series scrape')
  console.log('  Convex URL:', CONVEX_URL)
  console.log('  Headless:', headless)
  console.log('')

  const client = new ConvexHttpClient(CONVEX_URL)

  // Determine if input is URL or series ID
  const isUrl = input.startsWith('http')
  let seriesId: Id<'series'> | null = null
  let sourceUrl: string

  if (isUrl) {
    sourceUrl = input
    console.log('📚 Scraping URL directly:', sourceUrl)
  } else {
    seriesId = input as Id<'series'>

    // Get series info
    const series = await client.query(api.series.queries.get, { id: seriesId })

    if (!series) {
      console.error('❌ Series not found')
      process.exit(1)
    }

    console.log('📚 Series:', series.name)
    console.log('  Source URL:', series.sourceUrl)
    console.log('  Status:', series.scrapeStatus)

    if (!series.sourceUrl) {
      console.error('❌ Series has no sourceUrl - cannot scrape')
      process.exit(1)
    }

    sourceUrl = series.sourceUrl
  }

  console.log('')
  console.log('🌀 Scraping with Playwright...')
  console.log('')

  const startTime = Date.now()

  const result = await scrapeSeries(sourceUrl, { headless })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  if (!result.success) {
    console.error('🚨 Scrape failed:', result.error)
    process.exit(1)
  }

  const { data } = result

  console.log('')
  console.log('✅ Scrape complete in', elapsed, 'seconds')
  console.log('  Series name:', data.name)
  console.log('  Total books:', data.totalBooks ?? 'unknown')
  console.log('  Books found:', data.books.length)
  console.log('')
  console.log('📚 Books discovered:')

  for (const book of data.books) {
    const formatLabel = book.format !== 'unknown' ? ` [${book.format}]` : ''
    console.log(`  #${book.position ?? '?'}: ${book.title}${formatLabel} (${book.asin ?? 'no ASIN'})`)
  }

  // If we have a seriesId, save discoveries via mutation (no actions)
  if (seriesId) {
    console.log('')
    console.log('💾 Saving to Convex via mutation...')

    try {
      const result = await client.mutation(api.series.mutations.saveFromCliScrape, {
        apiKey: SCRAPE_IMPORT_KEY,
        seriesId,
        seriesName: data.name ?? 'Unknown Series',
        description: data.description ?? undefined,
        coverImageUrl: data.coverImageUrl ?? undefined,
        expectedBookCount: data.totalBooks ?? undefined,
        books: data.books
          .filter((book) => book.amazonUrl) // Only books with URLs
          .map((book) => ({
            title: book.title ?? 'Unknown Title',
            amazonUrl: book.amazonUrl!,
            asin: book.asin ?? undefined,
            position: book.position ?? undefined,
            coverImageUrl: book.coverImageUrl ?? undefined,
            authors: book.authors && book.authors.length > 0 ? book.authors : undefined,
          })),
        pagination: data.pagination
          ? {
              currentPage: data.pagination.currentPage,
              totalPages: data.pagination.totalPages ?? undefined,
              nextPageUrl: data.pagination.nextPageUrl ?? undefined,
            }
          : undefined,
      })

      console.log('')
      console.log('✅ Saved to Convex!')
      console.log('  Books found:', result.booksFound)
      console.log('  Pending:', result.pending)
      console.log('  Skipped:', result.skipped)
      console.log('  Has more pages:', result.hasMorePages)

      if (result.pending > 0) {
        console.log('')
        console.log('📋 Next steps:')
        console.log('  Go to /ad/series/' + seriesId)
        console.log('  Process pending discoveries (each uses Firecrawl for book details)')
      }
    } catch (error) {
      console.error('🚨 Save failed:', error)
      process.exit(1)
    }
  } else {
    console.log('')
    console.log('📋 To save this data:')
    console.log('  1. Create the series in admin UI')
    console.log('  2. Add the source URL:', sourceUrl)
    console.log('  3. Run this script again with the series ID')
  }

  console.log('')
  console.log('📊 Raw data:')
  console.log(JSON.stringify(data, null, 2))
}

main()
