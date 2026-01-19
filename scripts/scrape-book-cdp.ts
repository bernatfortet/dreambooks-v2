#!/usr/bin/env bunx tsx

/**
 * Scrape an Amazon book page using CDP connection to a running Chrome instance.
 * Chains series scraping and imports all books in the series.
 *
 * Prerequisites:
 *   Start Chrome with remote debugging:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *
 * Usage:
 *   bunx tsx scripts/scrape-book-cdp.ts "https://www.amazon.com/dp/1449488013"
 *   bunx tsx scripts/scrape-book-cdp.ts "https://www.amazon.com/dp/1449488013" --dry-run
 *   bunx tsx scripts/scrape-book-cdp.ts "https://www.amazon.com/dp/1449488013" --skip-series
 */

import * as dotenv from 'dotenv'
import { ConvexHttpClient } from 'convex/browser'
import { chromium, Browser, BrowserContext, Page } from 'playwright'

import { parseBookFromPage } from '../lib/scraping/domains/book/parse'
import { parseSeriesFromPage } from '../lib/scraping/domains/series/parse'
import { SeriesBookEntry } from '../lib/scraping/domains/series/types'
import { BookData } from '../lib/scraping/domains/book/types'
import { importBookToConvex } from './lib/convex-client'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'

dotenv.config({ path: '.env.local' })
dotenv.config()

const CDP_URL = 'http://localhost:9222'

// --- Human-like delay utilities ---

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

async function humanDelay(minMs: number, maxMs: number, label?: string): Promise<void> {
  const delay = randomDelay(minMs, maxMs)
  if (label) {
    console.log(`⏳ ${label} (${(delay / 1000).toFixed(1)}s)...`)
  }
  await new Promise((resolve) => setTimeout(resolve, delay))
}

async function simulateHumanBehavior(page: Page): Promise<void> {
  // Random scroll to make it look like a human is reading
  const scrollAmount = randomDelay(100, 400)
  await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount)
  await humanDelay(500, 1500)

  // Sometimes scroll back up a bit
  if (Math.random() > 0.6) {
    const scrollBack = randomDelay(50, 150)
    await page.evaluate((amount) => window.scrollBy(0, -amount), scrollBack)
    await humanDelay(300, 800)
  }
}

// --- Browser connection ---

type ConnectedBrowser = {
  browser: Browser
  context: BrowserContext
  page: Page
}

async function connectToBrowser(): Promise<ConnectedBrowser> {
  console.log(`🔌 Connecting to browser at ${CDP_URL}...`)

  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30000 })
  const contexts = browser.contexts()

  if (contexts.length === 0) {
    throw new Error('No browser contexts found. Make sure your browser has at least one window open.')
  }

  const context = contexts[0]
  const pages = context.pages()
  const page = pages.length > 0 ? pages[0] : await context.newPage()

  console.log('✅ Connected to browser')

  return { browser, context, page }
}

async function navigateWithRetry(params: {
  page: Page
  url: string
  maxRetries?: number
}): Promise<void> {
  const { page, url, maxRetries = 3 } = params

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌀 Navigating to ${url.substring(0, 60)}... (attempt ${attempt}/${maxRetries})`)

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })

      // Human-like wait after page load
      await humanDelay(2000, 4000)
      await simulateHumanBehavior(page)

      console.log('✅ Page loaded')
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`⚠️ Navigation attempt ${attempt} failed: ${message}`)

      if (attempt < maxRetries) {
        await humanDelay(3000, 6000, 'Retrying')
      }
    }
  }

  throw new Error('Navigation failed after all retries')
}

// --- Main workflow ---

async function main() {
  const args = process.argv.slice(2)
  const url = args.find((arg) => !arg.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  const skipSeries = args.includes('--skip-series')

  if (!url) {
    console.error('Usage: bunx tsx scripts/scrape-book-cdp.ts <amazon-url> [--dry-run] [--skip-series]')
    process.exit(1)
  }

  console.log('🏁 Starting CDP book scrape')
  console.log(`   URL: ${url}`)
  console.log(`   Dry run: ${dryRun}`)
  console.log(`   Skip series: ${skipSeries}`)
  console.log('')

  const { context } = await connectToBrowser()

  // Create a new tab for scraping
  const page = await context.newPage()
  console.log('📑 Created new tab for scraping')

  try {
    // Step 1: Scrape the initial book
    await navigateWithRetry({ page, url })
    const bookData = await parseBookFromPage(page)

    printBookData(bookData)

    if (!bookData.title || !bookData.authors?.length) {
      console.error('🚨 Failed to extract required book data')
      return
    }

    // Step 2: Import the book to Convex
    let bookId: string | null = null

    if (!dryRun) {
      const importResult = await importBookToConvex({
        scrapedData: bookData,
        amazonUrl: url,
      })

      bookId = importResult.bookId
      console.log(`✅ Book imported: ${importResult.bookId} (new: ${importResult.isNew})`)
    } else {
      console.log('🏁 Dry run - skipping import')
    }

    // Step 3: Chain series scraping if book has series info
    if (!skipSeries && bookData.seriesUrl && bookData.seriesName) {
      await humanDelay(3000, 6000, 'Preparing to scrape series')

      await scrapeAndImportSeries({
        page,
        seriesUrl: bookData.seriesUrl,
        seriesName: bookData.seriesName,
        originalBookAsin: bookData.asin,
        dryRun,
        bookId,
      })
    } else if (!bookData.seriesUrl) {
      console.log('')
      console.log('📚 Book is not part of a series (or series URL not found)')
    }

    console.log('')
    console.log('🎉 All done!')
  } finally {
    console.log('🗑️ Closing scraping tab')
    await page.close()
  }
}

async function scrapeAndImportSeries(params: {
  page: Page
  seriesUrl: string
  seriesName: string
  originalBookAsin: string | null
  dryRun: boolean
  bookId: string | null
}): Promise<void> {
  const { page, seriesUrl, seriesName, originalBookAsin, dryRun, bookId } = params

  console.log('')
  console.log('═'.repeat(60))
  console.log(`📚 SCRAPING SERIES: ${seriesName}`)
  console.log('═'.repeat(60))
  console.log('')

  // Navigate to series page
  await navigateWithRetry({ page, url: seriesUrl })

  // Parse series data
  const seriesData = await parseSeriesFromPage(page)

  console.log('')
  console.log(`📚 Series: ${seriesData.name ?? 'Unknown'}`)
  console.log(`   Total books: ${seriesData.totalBooks ?? 'Unknown'}`)
  console.log(`   Books found on page: ${seriesData.books.length}`)
  console.log('')

  // Filter out the book we already scraped and audiobooks
  const booksToScrape = seriesData.books.filter((book) => {
    if (book.format === 'audiobook') return false
    if (originalBookAsin && book.asin === originalBookAsin) return false
    if (!book.amazonUrl) return false
    return true
  })

  console.log(`📖 Books to scrape: ${booksToScrape.length}`)
  console.log('')

  // Save series to Convex first
  let seriesId: Id<'series'> | null = null

  if (!dryRun && bookId) {
    seriesId = await saveSeriesMetadata({
      seriesUrl,
      seriesName: seriesData.name ?? seriesName,
      description: seriesData.description,
      coverImageUrl: seriesData.coverImageUrl,
      expectedBookCount: seriesData.totalBooks,
      bookId,
    })
  }

  // Scrape each book in the series
  for (let i = 0; i < booksToScrape.length; i++) {
    const seriesBook = booksToScrape[i]

    console.log('')
    console.log('─'.repeat(60))
    console.log(`📖 Book ${i + 1}/${booksToScrape.length}: ${seriesBook.title ?? 'Unknown'}`)
    console.log(`   Position: #${seriesBook.position ?? '?'}`)
    console.log(`   ASIN: ${seriesBook.asin ?? 'Unknown'}`)
    console.log(`   Format: ${seriesBook.format}`)
    console.log('─'.repeat(60))

    // Human-like delay between books (longer between books)
    if (i > 0) {
      await humanDelay(5000, 12000, 'Waiting before next book')
    }

    await scrapeSeriesBook({
      page,
      seriesBook,
      seriesId,
      dryRun,
    })
  }

  console.log('')
  console.log('═'.repeat(60))
  console.log(`✅ SERIES COMPLETE: ${seriesName}`)
  console.log(`   Processed ${booksToScrape.length} books`)
  console.log('═'.repeat(60))
}

async function scrapeSeriesBook(params: {
  page: Page
  seriesBook: SeriesBookEntry
  seriesId: Id<'series'> | null
  dryRun: boolean
}): Promise<void> {
  const { page, seriesBook, seriesId, dryRun } = params

  if (!seriesBook.amazonUrl) {
    console.log('⚠️ No URL for this book, skipping')
    return
  }

  try {
    // Navigate to book page
    await navigateWithRetry({ page, url: seriesBook.amazonUrl })

    // Parse book data
    const bookData = await parseBookFromPage(page)

    if (!bookData.title) {
      console.log('⚠️ Failed to extract title, skipping')
      return
    }

    console.log(`   Title: ${bookData.title}`)
    console.log(`   Authors: ${bookData.authors?.join(', ') ?? 'Unknown'}`)
    console.log(`   ISBN-13: ${bookData.isbn13 ?? 'N/A'}`)
    console.log(`   Pages: ${bookData.pageCount ?? 'N/A'}`)

    if (dryRun) {
      console.log('   ✅ Would import (dry run)')
      return
    }

    // Import to Convex
    if (!bookData.authors?.length) {
      console.log('⚠️ No authors found, skipping import')
      return
    }

    const importResult = await importBookToConvex({
      scrapedData: bookData,
      amazonUrl: seriesBook.amazonUrl,
    })

    console.log(`   ✅ Imported: ${importResult.bookId} (new: ${importResult.isNew})`)

    // Link to series if we have seriesId and the book wasn't automatically linked
    if (seriesId && importResult.isNew) {
      await linkBookToSeries(importResult.bookId, seriesId, seriesBook.position)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`   🚨 Failed: ${message}`)
  }
}

async function saveSeriesMetadata(params: {
  seriesUrl: string
  seriesName: string
  description: string | null
  coverImageUrl: string | null
  expectedBookCount: number | null
  bookId: string
}): Promise<Id<'series'> | null> {
  const { seriesUrl, seriesName, description, coverImageUrl, bookId } = params

  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl) {
    console.warn('⚠️ CONVEX_URL not set, skipping series metadata save')
    return null
  }

  try {
    const client = new ConvexHttpClient(convexUrl)

    // Get or create series (upsertFromUrl handles description and coverImageUrl)
    const seriesId = await client.mutation(api.series.mutations.upsertFromUrl, {
      name: seriesName,
      sourceUrl: seriesUrl,
      description: description ?? undefined,
      coverImageUrl: coverImageUrl ?? undefined,
    })

    // Link the original book to the series
    await client.mutation(api.series.mutations.linkBookToSeries, {
      bookId: bookId as Id<'books'>,
      seriesId,
    })

    console.log(`✅ Series saved: ${seriesId}`)

    return seriesId
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`⚠️ Failed to save series metadata: ${message}`)
    return null
  }
}

async function linkBookToSeries(
  bookId: string,
  seriesId: Id<'series'>,
  position: number | null
): Promise<void> {
  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl) return

  try {
    const client = new ConvexHttpClient(convexUrl)

    await client.mutation(api.series.mutations.linkBookToSeries, {
      bookId: bookId as Id<'books'>,
      seriesId,
      seriesPosition: position ?? undefined,
    })
  } catch (error) {
    // Ignore - book might already be linked
  }
}

// --- Output helpers ---

function printBookData(book: BookData): void {
  console.log('')
  console.log('📚 Scraped Book Data:')
  console.log('─'.repeat(50))
  console.log(`  Title: ${book.title ?? 'N/A'}`)
  console.log(`  Subtitle: ${book.subtitle ?? 'N/A'}`)
  console.log(`  Authors: ${book.authors?.join(', ') ?? 'N/A'}`)
  console.log(`  ASIN: ${book.asin ?? 'N/A'}`)
  console.log(`  ISBN-10: ${book.isbn10 ?? 'N/A'}`)
  console.log(`  ISBN-13: ${book.isbn13 ?? 'N/A'}`)
  console.log(`  Publisher: ${book.publisher ?? 'N/A'}`)
  console.log(`  Published: ${book.publishedDate ?? 'N/A'}`)
  console.log(`  Pages: ${book.pageCount ?? 'N/A'}`)
  console.log(`  Cover URL: ${book.coverImageUrl ? '✅ Found' : '❌ Not found'}`)

  if (book.seriesName) {
    console.log(`  Series: ${book.seriesName} (Book ${book.seriesPosition ?? '?'})`)
    console.log(`  Series URL: ${book.seriesUrl ?? 'N/A'}`)
  }

  if (book.lexileScore || book.ageRange || book.gradeLevel) {
    console.log(`  Lexile: ${book.lexileScore ?? 'N/A'}`)
    console.log(`  Age Range: ${book.ageRange ?? 'N/A'}`)
    console.log(`  Grade Level: ${book.gradeLevel ?? 'N/A'}`)
  }

  if (book.description) {
    const truncated = book.description.length > 200 ? book.description.slice(0, 200) + '...' : book.description
    console.log(`  Description: ${truncated}`)
  }

  console.log('─'.repeat(50))
}

// Run
main().catch((error) => {
  console.error('🚨 Unhandled error:', error)
  process.exit(1)
})
