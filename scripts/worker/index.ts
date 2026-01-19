#!/usr/bin/env bunx tsx

/**
 * Local scraping worker that polls Convex for items to process.
 *
 * Prerequisites:
 *   Start Chrome with remote debugging:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *
 * Usage:
 *   bunx tsx scripts/worker/index.ts
 *   bunx tsx scripts/worker/index.ts --dry-run
 *   bunx tsx scripts/worker/index.ts --poll-interval=60
 */

import * as dotenv from 'dotenv'

import { PageManager } from './browser'
import { formatTime } from './utils'
import {
  processQueueFlow,
  processEnrichmentFlow,
  processSeriesDiscoveryFlow,
  processSeriesScrapingFlow,
} from './flows'
import { SCRAPING_CONFIG } from '../../lib/scraping/config'

dotenv.config({ path: '.env.local' })
dotenv.config()

const { defaultPollIntervalSeconds, idlePollMultiplier } = SCRAPING_CONFIG.worker

// --- Types ---

type WorkerConfig = {
  dryRun: boolean
  pollInterval: number
}

// --- Main worker loop ---

async function runWorkerLoop(config: WorkerConfig): Promise<void> {
  console.log('')
  console.log('═'.repeat(60))
  console.log('🤖 SCRAPING WORKER STARTED')
  console.log('═'.repeat(60))
  console.log(`   Dry run: ${config.dryRun}`)
  console.log(`   Poll interval: ${config.pollInterval}s`)
  console.log('')

  // Initialize page manager with auto-reconnect capability
  const pageManager = new PageManager()

  try {
    await pageManager.initialize()
  } catch (error) {
    console.error('')
    console.error('🚨 Failed to connect to browser.')
    console.error('')
    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error('Unknown error:', error)
    }
    console.error('')
    console.error('Quick fix: Run `bun run google` in another terminal, then restart the worker.')
    console.error('')
    process.exit(1)
  }

  console.log('')

  let iteration = 0

  while (true) {
    iteration++
    const timestamp = formatTime()

    console.log('─'.repeat(60))
    console.log(`🔄 Poll #${iteration} at ${timestamp}`)
    console.log('─'.repeat(60))

    let workDone = false

    // Get a healthy page (auto-reconnects if tab was closed)
    const page = await pageManager.getPage()

    // Priority 1: Process queue items (new URLs added from UI)
    try {
      const queueResult = await processQueueFlow({ page, pageManager, dryRun: config.dryRun })
      if (queueResult.workDone) workDone = true
    } catch (error) {
      console.error('🚨 Error processing queue:', error)
    }

    // Priority 2: Enrich books with basic details
    try {
      const enrichResult = await processEnrichmentFlow({ page, pageManager, dryRun: config.dryRun })
      if (enrichResult.workDone) workDone = true
    } catch (error) {
      console.error('🚨 Error enriching books:', error)
    }

    // Priority 3: Discover series URLs (for series without sourceUrl)
    try {
      const discoveryResult = await processSeriesDiscoveryFlow({ page, pageManager, dryRun: config.dryRun })
      if (discoveryResult.workDone) workDone = true
    } catch (error) {
      console.error('🚨 Error discovering series URLs:', error)
    }

    // Priority 4: Scrape pending/partial series
    try {
      const scrapingResult = await processSeriesScrapingFlow({ page, pageManager, dryRun: config.dryRun })
      if (scrapingResult.workDone) workDone = true
    } catch (error) {
      console.error('🚨 Error scraping series:', error)
    }

    // Wait before next poll
    const waitTime = workDone ? config.pollInterval : config.pollInterval * idlePollMultiplier
    console.log('')
    console.log(`💤 Sleeping for ${waitTime}s...`)
    console.log('')

    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000))
  }
}

// --- CLI parsing ---

function parseArgs(): WorkerConfig {
  const args = process.argv.slice(2)

  const dryRun = args.includes('--dry-run')

  let pollInterval = defaultPollIntervalSeconds
  const pollArg = args.find((arg) => arg.startsWith('--poll-interval='))
  if (pollArg) {
    const value = parseInt(pollArg.split('=')[1], 10)
    if (!isNaN(value) && value > 0) {
      pollInterval = value
    }
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Scraping Worker - Polls Convex for items to scrape

Usage:
  bunx tsx scripts/worker/index.ts [options]

Options:
  --dry-run              Don't save changes to Convex
  --poll-interval=N      Seconds between polls (default: ${defaultPollIntervalSeconds})
  --help, -h             Show this help

Prerequisites:
  Start Chrome with remote debugging:
  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

What the worker processes (in priority order):
  1. Queued URLs (from /ad/ UI) - books, series, or authors
  2. Books needing enrichment (detailsStatus: 'basic')
  3. Series URL discovery (pending series without sourceUrl)
  4. Series scraping (scrapeStatus: 'pending' or 'partial')
`)
    process.exit(0)
  }

  return { dryRun, pollInterval }
}

// --- Entry point ---

const config = parseArgs()

runWorkerLoop(config).catch((error) => {
  console.error('🚨 Worker crashed:', error)
  process.exit(1)
})
