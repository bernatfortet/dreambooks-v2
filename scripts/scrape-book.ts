#!/usr/bin/env bunx tsx

/**
 * Local Amazon book scraper using Playwright with stealth mode.
 *
 * Usage:
 *   bunx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M"
 *   bunx tsx scripts/scrape-book.ts "https://www.amazon.com/gp/product/1250219957"
 *   bunx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --dry-run
 *   bunx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --headless=false
 *
 * Environment variables:
 *   CONVEX_URL - Convex deployment URL (required unless --dry-run)
 *   SCRAPE_IMPORT_KEY - API key for import action (required unless --dry-run)
 */

import * as dotenv from 'dotenv'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

import { scrapeBook, BookData } from '../lib/scraping'
import { scrapeSeries } from '../lib/scraping/domains/series'
import { importBookToConvex } from './lib/convex-client'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'

// Load environment variables (.env.local takes precedence over .env)
dotenv.config({ path: '.env.local' })
dotenv.config()

type CliArgs = {
  url: string
  dryRun: boolean
  headless: boolean
}

async function main() {
  const args = parseArgs()

  console.log('🏁 Starting Amazon book scrape')
  console.log(`   URL: ${args.url}`)
  console.log(`   Dry run: ${args.dryRun}`)
  console.log(`   Headless: ${args.headless}`)
  console.log('')

  // Validate URL (accept /dp/ and /gp/product/ formats)
  if (!isAmazonUrl(args.url)) {
    console.error('🚨 Invalid URL. Expected an Amazon product URL.')
    process.exit(1)
  }

  // Scrape the page using the centralized scraping library
  const scrapeResult = await scrapeBook(args.url, {
    provider: 'playwright',
    headless: args.headless,
  })

  if (!scrapeResult.success) {
    console.error('🚨 Scraping failed:', scrapeResult.error)
    await logFailedUrl(args.url, scrapeResult.error)
    process.exit(1)
  }

  const bookData = scrapeResult.data

  // Validate required fields
  if (!bookData.title) {
    console.error('🚨 Failed to extract title from page')
    await logFailedUrl(args.url, 'Missing title')
    process.exit(1)
  }

  if (!bookData.authors?.length) {
    console.error('🚨 Failed to extract authors from page')
    await logFailedUrl(args.url, 'Missing authors')
    process.exit(1)
  }

  // Output results
  console.log('')
  console.log('📚 Scraped Book Data:')
  console.log('─'.repeat(50))
  printBookData(bookData)
  console.log('─'.repeat(50))

  const outputFileNameBase = getOutputFileNameBase({ url: args.url, bookData })

  // Dry run - just output the data
  if (args.dryRun) {
    console.log('')
    console.log('🏁 Dry run complete. No data saved.')
    await saveOutput(outputFileNameBase, bookData)
    return
  }

  // Import to Convex
  let bookId: string | null = null
  try {
    const result = await importBookToConvex({
      scrapedData: bookData,
      amazonUrl: args.url,
    })

    bookId = result.bookId

    console.log('')
    console.log('✅ Book imported successfully!')
    console.log(`   Book ID: ${result.bookId}`)
    console.log(`   Is new: ${result.isNew}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('🚨 Failed to import to Convex:', message)
    await logFailedUrl(args.url, message)
    process.exit(1)
  }

  // Chain series scraping if book has series info
  if (bookData.seriesUrl && bookData.seriesName && bookId) {
    console.log('')
    console.log('🔗 Book is part of a series, scraping series page...')
    console.log(`   Series: ${bookData.seriesName}`)
    console.log(`   Series URL: ${bookData.seriesUrl}`)
    console.log('')

    try {
      await scrapeSeriesFromBook({
        seriesUrl: bookData.seriesUrl,
        seriesName: bookData.seriesName,
        bookId,
        headless: args.headless,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('⚠️ Series scraping failed:', message)
      console.log('   (Book was imported successfully, but series scraping failed)')
    }
  }
}

async function scrapeSeriesFromBook(params: {
  seriesUrl: string
  seriesName: string
  bookId: string
  headless: boolean
}) {
  const { seriesUrl, seriesName, bookId, headless } = params

  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }

  const client = new ConvexHttpClient(convexUrl)

  // Get the book to find its seriesId
  const book = await client.query(api.books.queries.get, { id: bookId as Id<'books'> })
  if (!book) {
    throw new Error('Book not found after import')
  }

  // Get or create series ID
  let seriesId: Id<'series'> | null = book.seriesId ?? null

  if (!seriesId) {
    // Series should have been created during import, but if not, create it now
    seriesId = await client.mutation(api.series.mutations.upsertFromUrl, {
      name: seriesName,
      sourceUrl: seriesUrl,
    })

    // Link book to series if not already linked
    if (!book.seriesId) {
      await client.mutation(api.series.mutations.linkBookToSeries, {
        bookId: bookId as Id<'books'>,
        seriesId,
      })
    }
  }

  console.log(`🌀 Scraping series with Playwright...`)
  console.log(`   Series ID: ${seriesId}`)
  console.log('')

  const startTime = Date.now()
  const result = await scrapeSeries(seriesUrl, { headless })
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  if (!result.success) {
    throw new Error(result.error ?? 'Series scraping failed')
  }

  const { data } = result

  console.log('')
  console.log('✅ Series scrape complete in', elapsed, 'seconds')
  console.log('  Series name:', data.name)
  console.log('  Total books:', data.totalBooks ?? 'unknown')
  console.log('  Books found:', data.books.length)
  console.log('')
  console.log('📚 Books discovered:')

  for (const book of data.books) {
    const formatLabel = book.format !== 'unknown' ? ` [${book.format}]` : ''
    const authorsLabel = book.authors && book.authors.length > 0 ? ` by ${book.authors.join(', ')}` : ''
    console.log(`  #${book.position ?? '?'}: ${book.title}${authorsLabel}${formatLabel} (${book.asin ?? 'no ASIN'})`)
  }

  console.log('')
  console.log('💾 Saving to Convex via mutation...')

  const saveResult = await client.mutation(api.series.mutations.saveFromCliScrape, {
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
  console.log('✅ Series scrape saved to Convex!')
  console.log('  Books found:', saveResult.booksFound)
  console.log('  Pending:', saveResult.pending)
  console.log('  Skipped:', saveResult.skipped)
  console.log('  Has more pages:', saveResult.hasMorePages)

  if (saveResult.pending > 0) {
    console.log('')
    console.log('📋 Next steps:')
    console.log('  Go to /ad/series/' + seriesId)
    console.log('  Process pending discoveries (each uses Firecrawl for book details)')
  }
}

// --- Helper functions ---

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage()
    process.exit(0)
  }

  const url = args.find((arg) => !arg.startsWith('--'))
  if (!url) {
    console.error('🚨 Missing URL argument')
    printUsage()
    process.exit(1)
  }

  const dryRun = args.includes('--dry-run')
  const headlessArg = args.find((arg) => arg.startsWith('--headless='))
  const headless = headlessArg ? headlessArg.split('=')[1] !== 'false' : true

  return { url, dryRun, headless }
}

function printUsage() {
  console.log(`
Usage: bunx tsx scripts/scrape-book.ts <amazon-url> [options]

Options:
  --dry-run         Scrape but don't save to database
  --headless=false  Run browser in visible mode (for debugging)
  --help, -h        Show this help message

Examples:
  bunx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M"
  bunx tsx scripts/scrape-book.ts "https://www.amazon.com/gp/product/1250219957"
  bunx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --dry-run
  bunx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --headless=false

Environment variables:
  CONVEX_URL         - Your Convex deployment URL
  SCRAPE_IMPORT_KEY  - API key for the import action
`)
}

function printBookData(data: BookData) {
  console.log(`  Title: ${data.title ?? 'N/A'}`)
  console.log(`  Subtitle: ${data.subtitle ?? 'N/A'}`)
  console.log(`  Authors: ${data.authors?.join(', ') ?? 'N/A'}`)
  console.log(`  ASIN: ${data.asin ?? 'N/A'}`)
  console.log(`  ISBN-10: ${data.isbn10 ?? 'N/A'}`)
  console.log(`  ISBN-13: ${data.isbn13 ?? 'N/A'}`)
  console.log(`  Publisher: ${data.publisher ?? 'N/A'}`)
  console.log(`  Published: ${data.publishedDate ?? 'N/A'}`)
  console.log(`  Pages: ${data.pageCount ?? 'N/A'}`)
  console.log(`  Cover URL: ${data.coverImageUrl ? '✅ Found' : '❌ Not found'}`)

  if (data.seriesName) {
    console.log(`  Series: ${data.seriesName} (Book ${data.seriesPosition ?? '?'})`)
    console.log(`  Series URL: ${data.seriesUrl ?? 'N/A'}`)
  }

  if (data.lexileScore || data.ageRange || data.gradeLevel) {
    console.log(`  Lexile: ${data.lexileScore ?? 'N/A'}`)
    console.log(`  Age Range: ${data.ageRange ?? 'N/A'}`)
    console.log(`  Grade Level: ${data.gradeLevel ?? 'N/A'}`)
  }

  if (data.description) {
    const truncated = data.description.length > 100 ? data.description.slice(0, 100) + '...' : data.description
    console.log(`  Description: ${truncated}`)
  }
}

async function saveOutput(outputFileNameBase: string, data: BookData) {
  const outputDir = join(process.cwd(), 'scripts', 'output')
  const outputFile = join(outputDir, `${outputFileNameBase}.json`)

  try {
    await mkdir(outputDir, { recursive: true })
    await writeFile(outputFile, JSON.stringify(data, null, 2))
    console.log(`💾 Output saved to: ${outputFile}`)
  } catch (error) {
    console.warn('⚠️ Failed to save output file:', error)
  }
}

function getOutputFileNameBase(params: { url: string; bookData: BookData }): string {
  const { url, bookData } = params

  const fromData = bookData.asin ?? bookData.isbn13 ?? bookData.isbn10
  if (fromData) return sanitizeFileName(fromData)

  const fromUrl = extractAmazonProductIdFromUrl(url)
  if (fromUrl) return sanitizeFileName(fromUrl)

  return 'book'
}

function extractAmazonProductIdFromUrl(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function isAmazonUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'www.amazon.com' || parsed.hostname.endsWith('.amazon.com')
  } catch {
    return false
  }
}

function sanitizeFileName(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '-')
  return sanitized || 'book'
}

async function logFailedUrl(url: string, error: string) {
  const outputDir = join(process.cwd(), 'scripts', 'output')
  const failedFile = join(outputDir, 'failed.json')

  try {
    await mkdir(outputDir, { recursive: true })

    let failed: Array<{ url: string; error: string; timestamp: string }> = []
    try {
      const existing = await import(failedFile)
      failed = existing.default ?? []
    } catch {
      // File doesn't exist yet
    }

    failed.push({
      url,
      error,
      timestamp: new Date().toISOString(),
    })

    await writeFile(failedFile, JSON.stringify(failed, null, 2))
    console.log(`📝 Logged failed URL to: ${failedFile}`)
  } catch (logError) {
    console.warn('⚠️ Failed to log error:', logError)
  }
}

// Run
main().catch((error) => {
  console.error('🚨 Unhandled error:', error)
  process.exit(1)
})
