#!/usr/bin/env bun
/**
 * Unified debug CLI for scraping diagnostics.
 *
 * Usage:
 *   bun scripts/debug.ts inspect series <seriesId>
 *   bun scripts/debug.ts inspect book <bookId|--asin ASIN>
 *   bun scripts/debug.ts parse series <htmlFile>
 *   bun scripts/debug.ts parse book <htmlFile>
 *   bun scripts/debug.ts scrape series <url> [--verbose]
 *   bun scripts/debug.ts scrape book <url> [--verbose]
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { readFile } from 'fs/promises'
import * as dotenv from 'dotenv'

// Loose types for debug output - these are intentionally permissive
// since debug data can have varying shapes
/* eslint-disable @typescript-eslint/no-explicit-any */
type DebugData = Record<string, any>

// Load environment variables
dotenv.config({ path: '.env.local' })
dotenv.config()

function getConvexUrl(): string {
  const url = process.env.CONVEX_URL
  if (!url) {
    console.error('Missing CONVEX_URL environment variable. Set it in .env.local')
    process.exit(1)
  }
  return url
}

// --- Main CLI ---

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
    printUsage()
    process.exit(0)
  }

  const command = args[0]
  const subcommand = args[1]

  switch (command) {
    case 'inspect':
      await handleInspect(subcommand, args.slice(2))
      break
    case 'parse':
      await handleParse(subcommand, args.slice(2))
      break
    case 'scrape':
      await handleScrape(subcommand, args.slice(2))
      break
    default:
      console.error(`Unknown command: ${command}`)
      printUsage()
      process.exit(1)
  }
}

function printUsage() {
  console.log(`
Scraping Debug CLI

Commands:
  inspect <type> <id>     Show entity state + scrape artifacts from Convex
  parse <type> <file>     Parse saved HTML file offline
  scrape <type> <url>     Dry-run scrape without saving

Types: series, book

Examples:
  bun scripts/debug.ts inspect series jd735x8qbew8898davr9scknkd7z9kxc
  bun scripts/debug.ts inspect book --asin B09HCDXVS2
  bun scripts/debug.ts parse series .cursor/debug-html/series_B09HCDXVS2.html
  bun scripts/debug.ts scrape series "https://amazon.com/dp/B09HCDXVS2" --verbose
`)
}

// --- Inspect Command ---

async function handleInspect(type: string, args: string[]) {
  if (!['series', 'book'].includes(type)) {
    console.error(`Invalid type: ${type}. Use 'series' or 'book'.`)
    process.exit(1)
  }

  const client = new ConvexHttpClient(getConvexUrl())

  if (type === 'series') {
    const seriesId = args[0]
    if (!seriesId) {
      console.error('Missing series ID')
      process.exit(1)
    }

    console.log(`\n🔍 Inspecting series: ${seriesId}\n`)

    // TODO: inspectSeries query doesn't exist yet
    // const result = await client.query(api.debug.queries.inspectSeries, {
    //   id: seriesId as Id<'series'>,
    // })
    console.log('⚠️  inspectSeries query not yet implemented')
    const result = null

    if (!result) {
      console.error('Series not found')
      process.exit(1)
    }

    printInspectResult(result, 'series')
  }

  if (type === 'book') {
    const asinFlag = args.indexOf('--asin')
    let bookId: string | undefined
    let asin: string | undefined

    if (asinFlag !== -1) {
      asin = args[asinFlag + 1]
    } else {
      bookId = args[0]
    }

    if (!bookId && !asin) {
      console.error('Missing book ID or --asin')
      process.exit(1)
    }

    console.log(`\n🔍 Inspecting book: ${bookId || `ASIN ${asin}`}\n`)

    const result = await client.query(api.debug.queries.inspectBook, {
      id: bookId as Id<'books'> | undefined,
      asin,
    })

    if (!result) {
      console.error('Book not found')
      process.exit(1)
    }

    printInspectResult(result, 'book')
  }
}

function printInspectResult(result: DebugData, type: 'series' | 'book') {
  const { entity, scrapeRuns, artifacts, seriesInfo } = result

  // Key fields to highlight
  console.log('━'.repeat(60))
  console.log('📊 KEY FIELDS (check these first)')
  console.log('━'.repeat(60))

  if (type === 'series') {
    console.log(`  name:            ${entity.name}`)
    console.log(`  scrapeStatus:    ${entity.scrapeStatus}`)
    console.log(`  coverSourceUrl:  ${entity.coverSourceUrl ?? '❌ NULL'}`)
    console.log(`  coverStorageId:  ${entity.coverStorageId ?? '❌ NULL'}`)
    console.log(`  coverUrl:        ${entity.coverUrl ?? '❌ NULL'}`)
  } else {
    console.log(`  title:           ${entity.title}`)
    console.log(`  coverSourceUrl:  ${entity.cover?.sourceUrl ?? '❌ NULL'}`)
    console.log(`  coverStorageId:  ${entity.cover?.storageIdMedium ?? '❌ NULL'}`)
    console.log(`  coverUrl:        ${entity.coverUrl ?? '❌ NULL'}`)
    console.log(`  coverStatus:     ${entity.coverStatus}`)
    console.log(`  detailsStatus:   ${entity.detailsStatus ?? 'N/A'}`)
  }

  // Scrape runs (for series)
  if (scrapeRuns?.length) {
    console.log('')
    console.log('━'.repeat(60))
    console.log('📜 RECENT SCRAPE RUNS')
    console.log('━'.repeat(60))

    for (const run of scrapeRuns) {
      const date = new Date(run.startedAt).toISOString()
      console.log(`  [${run.status}] ${date}`)
      if (run.extracted) {
        console.log(`    extracted.coverUrl: ${run.extracted.coverUrl ?? '❌ NULL'}`)
        console.log(`    extracted.seriesName: ${run.extracted.seriesName ?? 'N/A'}`)
        console.log(`    extracted.booksFound: ${run.extracted.booksFound ?? 'N/A'}`)
      }
      if (run.errorMessage) {
        console.log(`    error: ${run.errorMessage}`)
      }
    }
  }

  // Artifacts
  if (artifacts?.length) {
    console.log('')
    console.log('━'.repeat(60))
    console.log('📦 RECENT ARTIFACTS')
    console.log('━'.repeat(60))

    for (const artifact of artifacts) {
      const date = new Date(artifact.createdAt).toISOString()
      console.log(`  [${artifact.adapter}] v${artifact.scrapeVersion} - ${date}`)

      // Extract key fields from payload
      const payload = artifact.payload
      if (payload.coverImageUrl) {
        console.log(`    payload.coverImageUrl: ${payload.coverImageUrl}`)
      } else {
        console.log(`    payload.coverImageUrl: ❌ NULL`)
      }

      if (payload.seriesName) {
        console.log(`    payload.seriesName: ${payload.seriesName}`)
      }

      if (payload.books) {
        console.log(`    payload.books: ${payload.books.length} books`)
      }
    }
  }

  // Series info (for books)
  if (seriesInfo) {
    console.log('')
    console.log('━'.repeat(60))
    console.log('📚 LINKED SERIES')
    console.log('━'.repeat(60))
    console.log(`  name:            ${seriesInfo.name}`)
    console.log(`  coverSourceUrl:  ${seriesInfo.coverSourceUrl ?? '❌ NULL'}`)
    console.log(`  coverStorageId:  ${seriesInfo.coverStorageId ?? '❌ NULL'}`)
  }

  // Full JSON
  console.log('')
  console.log('━'.repeat(60))
  console.log('📄 FULL DATA (JSON)')
  console.log('━'.repeat(60))
  console.log(JSON.stringify(result, null, 2))
}

// --- Parse Command ---

async function handleParse(type: string, args: string[]) {
  if (!['series', 'book'].includes(type)) {
    console.error(`Invalid type: ${type}. Use 'series' or 'book'.`)
    process.exit(1)
  }

  const htmlFile = args[0]
  if (!htmlFile) {
    console.error('Missing HTML file path')
    process.exit(1)
  }

  console.log(`\n🔍 Parsing ${type} from: ${htmlFile}\n`)

  // Read HTML file
  let html: string
  try {
    html = await readFile(htmlFile, 'utf-8')
  } catch (error) {
    console.error(`Failed to read file: ${htmlFile}`)
    process.exit(1)
  }

  // Import dynamically to avoid loading Playwright unless needed
  const { chromium } = await import('playwright')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Load HTML into page
  await page.setContent(html, { waitUntil: 'domcontentloaded' })

  let result: DebugData

  if (type === 'series') {
    const { parseSeriesFromPage } = await import('../lib/scraping/domains/series/parse')
    result = (await parseSeriesFromPage(page)) as DebugData
  } else {
    const { parseBookFromPage } = await import('../lib/scraping/domains/book/parse')
    result = (await parseBookFromPage(page)) as DebugData
  }

  await browser.close()

  // Highlight key fields
  console.log('━'.repeat(60))
  console.log('📊 KEY FIELDS')
  console.log('━'.repeat(60))

  if (type === 'series') {
    console.log(`  name:           ${result.name ?? '❌ NULL'}`)
    console.log(`  coverImageUrl:  ${result.coverImageUrl ?? '❌ NULL'}`)
    console.log(`  totalBooks:     ${result.totalBooks ?? 'N/A'}`)
    console.log(`  books.length:   ${result.books?.length ?? 0}`)
  } else {
    console.log(`  title:          ${result.title ?? '❌ NULL'}`)
    console.log(`  coverImageUrl:  ${result.coverImageUrl ?? '❌ NULL'}`)
    console.log(`  authors:        ${result.authors?.join(', ') ?? '❌ NULL'}`)
    console.log(`  asin:           ${result.asin ?? 'N/A'}`)
  }

  console.log('')
  console.log('━'.repeat(60))
  console.log('📄 FULL DATA (JSON)')
  console.log('━'.repeat(60))
  console.log(JSON.stringify(result, null, 2))
}

// --- Scrape Command ---

async function handleScrape(type: string, args: string[]) {
  if (!['series', 'book'].includes(type)) {
    console.error(`Invalid type: ${type}. Use 'series' or 'book'.`)
    process.exit(1)
  }

  const url = args.find((a) => !a.startsWith('--'))
  const verbose = args.includes('--verbose')

  if (!url) {
    console.error('Missing URL')
    process.exit(1)
  }

  console.log(`\n🌀 Dry-run scraping ${type}: ${url}\n`)
  console.log(`  verbose: ${verbose}`)
  console.log('')

  const startTime = Date.now()

  type ScrapeResult = { success: true; data: DebugData } | { success: false; error: string }
  let result: ScrapeResult

  if (type === 'series') {
    const { scrapeSeries } = await import('../lib/scraping/domains/series')
    result = (await scrapeSeries(url, { headless: true })) as ScrapeResult
  } else {
    const { scrapeBook } = await import('../lib/scraping')
    result = (await scrapeBook(url, { headless: true })) as ScrapeResult
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  if (!result.success) {
    console.error(`\n🚨 Scrape failed: ${result.error}`)
    process.exit(1)
  }

  const data = result.data

  console.log('')
  console.log('━'.repeat(60))
  console.log(`✅ SCRAPE COMPLETE (${elapsed}s)`)
  console.log('━'.repeat(60))

  if (type === 'series') {
    console.log(`  name:           ${data.name ?? '❌ NULL'}`)
    console.log(`  coverImageUrl:  ${data.coverImageUrl ?? '❌ NULL'}`)
    console.log(`  totalBooks:     ${data.totalBooks ?? 'N/A'}`)
    console.log(`  books.length:   ${data.books?.length ?? 0}`)
  } else {
    console.log(`  title:          ${data.title ?? '❌ NULL'}`)
    console.log(`  coverImageUrl:  ${data.coverImageUrl ?? '❌ NULL'}`)
    console.log(`  authors:        ${data.authors?.join(', ') ?? '❌ NULL'}`)
    console.log(`  asin:           ${data.asin ?? 'N/A'}`)
  }

  console.log('')
  console.log('━'.repeat(60))
  console.log('📄 FULL DATA (JSON)')
  console.log('━'.repeat(60))
  console.log(JSON.stringify(data, null, 2))
}

// --- Run ---

main().catch((error) => {
  console.error('🚨 Error:', error)
  process.exit(1)
})
