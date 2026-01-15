#!/usr/bin/env npx tsx

/**
 * Local Amazon book scraper using Playwright with stealth mode.
 *
 * Usage:
 *   npx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M"
 *   npx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --dry-run
 *   npx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --headless=false
 *
 * Environment variables:
 *   CONVEX_URL - Convex deployment URL (required unless --dry-run)
 *   SCRAPE_IMPORT_KEY - API key for import action (required unless --dry-run)
 */

import * as dotenv from 'dotenv'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

import { scrapeBook, extractAsinFromUrl, BookData } from '../lib/scraping'
import { importBookToConvex } from './lib/convex-client'

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

  // Validate URL
  const asin = extractAsinFromUrl(args.url)
  if (!asin) {
    console.error('🚨 Invalid Amazon URL. Expected format: https://www.amazon.com/dp/ASIN')
    process.exit(1)
  }

  console.log(`🔍 Detected ASIN: ${asin}`)

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

  // Dry run - just output the data
  if (args.dryRun) {
    console.log('')
    console.log('🏁 Dry run complete. No data saved.')
    await saveOutput(asin, bookData)
    return
  }

  // Import to Convex
  try {
    const result = await importBookToConvex({
      scrapedData: bookData,
      amazonUrl: args.url,
    })

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
Usage: npx tsx scripts/scrape-book.ts <amazon-url> [options]

Options:
  --dry-run         Scrape but don't save to database
  --headless=false  Run browser in visible mode (for debugging)
  --help, -h        Show this help message

Examples:
  npx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M"
  npx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --dry-run
  npx tsx scripts/scrape-book.ts "https://www.amazon.com/dp/B07T8WRV2M" --headless=false

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

async function saveOutput(asin: string, data: BookData) {
  const outputDir = join(process.cwd(), 'scripts', 'output')
  const outputFile = join(outputDir, `${asin}.json`)

  try {
    await mkdir(outputDir, { recursive: true })
    await writeFile(outputFile, JSON.stringify(data, null, 2))
    console.log(`💾 Output saved to: ${outputFile}`)
  } catch (error) {
    console.warn('⚠️ Failed to save output file:', error)
  }
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
