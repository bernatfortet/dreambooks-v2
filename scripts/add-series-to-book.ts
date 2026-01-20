#!/usr/bin/env npx tsx

/**
 * Script to scrape series info from an Amazon series page and link it to an existing book.
 * Usage: npx tsx scripts/add-series-to-book.ts <bookId> <seriesUrl>
 *
 * Example:
 *   npx tsx scripts/add-series-to-book.ts j97fwxqp6xx0j6px43am7kzt4h7z4rdk "https://www.amazon.com/dp/B0CTHRGFF7"
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { parseSeriesFromPage } from '@/lib/scraping/domains/series/parse'
import { withBrowser } from '@/lib/scraping/providers/playwright/browser'
import { navigateWithRetry } from '@/lib/scraping/providers/playwright/browser'

const CONVEX_URL = process.env.CONVEX_URL || 'https://abundant-bee-200.convex.cloud'

async function main() {
  const bookId = process.argv[2]
  const seriesUrl = process.argv[3]

  if (!bookId || !seriesUrl) {
    console.error('Usage: npx tsx scripts/add-series-to-book.ts <bookId> <seriesUrl>')
    console.error('')
    console.error('Example:')
    console.error('  npx tsx scripts/add-series-to-book.ts j97fwxqp6xx0j6px43am7kzt4h7z4rdk "https://www.amazon.com/dp/B0CTHRGFF7"')
    process.exit(1)
  }

  console.log('🏁 Scraping series info from Amazon series page...')
  console.log(`   Book ID: ${bookId}`)
  console.log(`   Series URL: ${seriesUrl}`)
  console.log('')

  // Scrape series page using Playwright
  const result = await withBrowser({
    config: { headless: true },
    action: async (page) => {
      await navigateWithRetry({ page, url: seriesUrl, waitMs: 3000 })
      const seriesData = await parseSeriesFromPage(page)

      return {
        seriesName: seriesData.name,
        seriesUrl: seriesUrl,
        description: seriesData.description,
        coverImageUrl: seriesData.coverImageUrl,
      }
    },
  })

  if (!result.success) {
    console.error('🚨 Failed to scrape series info:', result.error)
    process.exit(1)
  }

  const { seriesName, seriesUrl: normalizedSeriesUrl, description, coverImageUrl } = result.data

  if (!seriesName) {
    console.error('🚨 No series name found on the page')
    process.exit(1)
  }

  console.log('✅ Found series info:')
  console.log(`   Series Name: ${seriesName}`)
  console.log(`   Series URL: ${normalizedSeriesUrl}`)
  console.log(`   Description: ${description ? 'Found' : 'N/A'}`)
  console.log(`   Cover: ${coverImageUrl ? 'Found' : 'N/A'}`)
  console.log('')

  // Create/upsert series and link book via Convex
  console.log('💾 Creating series and linking book...')

  const client = new ConvexHttpClient(CONVEX_URL)

  try {
    // First, update book with series info
    await client.mutation(api.books.mutations.updateSeriesInfo, {
      bookId: bookId as any,
      seriesName,
      seriesUrl: normalizedSeriesUrl,
      seriesPosition: undefined, // We don't know the position from the series page
    })

    console.log('✅ Updated book with series info')

    // Get or create the series (this will also link the book if createFromBook is used)
    // But first, let's create/upsert the series
    const seriesId = await client.mutation(api.series.mutations.upsertFromUrl, {
      name: seriesName,
      sourceUrl: normalizedSeriesUrl,
      description: description ?? undefined,
      coverImageUrl: coverImageUrl ?? undefined,
    })

    console.log(`✅ Series created/found: ${seriesId}`)

    // Link book to series
    await client.mutation(api.series.mutations.linkBookToSeries, {
      bookId: bookId as any,
      seriesId: seriesId as any,
      seriesPosition: undefined,
    })

    console.log('✅ Linked book to series')

    console.log('✅ Successfully processed series!')
  } catch (error) {
    console.error('🚨 Failed to process series:', error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('🚨 Unhandled error:', error)
  process.exit(1)
})
