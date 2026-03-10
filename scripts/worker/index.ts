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
  processVersionUpgradeFlow,
} from './flows'
import { fetchEntityStats, type EntityStats } from './convex'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'

dotenv.config({ path: '.env.local' })
dotenv.config()

const { defaultPollIntervalSeconds, idlePollMultiplier } = SCRAPING_CONFIG.worker

// --- Types ---

type WorkerConfig = {
  dryRun: boolean
  pollInterval: number
  untilIdle: number | null // Exit after N consecutive idle polls (null = run forever)
}

// --- Main worker loop ---

async function runWorkerLoop(config: WorkerConfig): Promise<void> {
  console.log('')
  console.log('═'.repeat(60))
  console.log('🤖 SCRAPING WORKER STARTED')
  console.log('═'.repeat(60))
  console.log(`   Dry run: ${config.dryRun}`)
  console.log(`   Poll interval: ${config.pollInterval}s`)
  if (config.untilIdle !== null) {
    console.log(`   Until idle: ${config.untilIdle} consecutive idle poll(s)`)
  }
  console.log('')

  // Fetch initial entity counts
  let startStats: EntityStats
  try {
    startStats = await fetchEntityStats()
    console.log('📊 Session start:', {
      books: startStats.books,
      series: startStats.series,
      authors: startStats.authors,
    })
  } catch (error) {
    console.error('⚠️ Could not fetch initial stats:', error)
    startStats = { books: 0, series: 0, authors: 0 }
  }
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
  let lastStatsLog = Date.now()
  let consecutiveIdles = 0

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

    // Priority 5: Queue outdated entities for re-scraping (version upgrades)
    try {
      const upgradeResult = await processVersionUpgradeFlow({ dryRun: config.dryRun })
      if (upgradeResult.workDone) workDone = true
    } catch (error) {
      console.error('🚨 Error processing version upgrades:', error)
    }

    // Log session stats periodically (every 5 minutes) or when work was done
    const now = Date.now()
    const statsPeriodMs = 5 * 60 * 1000 // 5 minutes
    if (workDone || now - lastStatsLog > statsPeriodMs) {
      try {
        const currentStats = await fetchEntityStats()
        const booksDelta = currentStats.books - startStats.books
        const seriesDelta = currentStats.series - startStats.series
        const authorsDelta = currentStats.authors - startStats.authors

        if (booksDelta !== 0 || seriesDelta !== 0 || authorsDelta !== 0) {
          console.log('📊 Session progress:', {
            books: `${currentStats.books} (${booksDelta >= 0 ? '+' : ''}${booksDelta})`,
            series: `${currentStats.series} (${seriesDelta >= 0 ? '+' : ''}${seriesDelta})`,
            authors: `${currentStats.authors} (${authorsDelta >= 0 ? '+' : ''}${authorsDelta})`,
          })
        }
        lastStatsLog = now
      } catch {
        // Ignore stats fetch errors
      }
    }

    // Track consecutive idle polls for --until-idle mode
    if (workDone) {
      consecutiveIdles = 0
    } else {
      consecutiveIdles++

      // Exit if we've reached the idle threshold
      if (config.untilIdle !== null && consecutiveIdles >= config.untilIdle) {
        console.log('')
        console.log('═'.repeat(60))
        console.log('✅ WORKER COMPLETE (idle threshold reached)')
        console.log('═'.repeat(60))

        // Print final session summary
        try {
          const finalStats = await fetchEntityStats()
          const booksDelta = finalStats.books - startStats.books
          const seriesDelta = finalStats.series - startStats.series
          const authorsDelta = finalStats.authors - startStats.authors

          console.log('')
          console.log('📊 Final session summary:')
          console.log(`   Books:   ${startStats.books} → ${finalStats.books} (${booksDelta >= 0 ? '+' : ''}${booksDelta})`)
          console.log(`   Series:  ${startStats.series} → ${finalStats.series} (${seriesDelta >= 0 ? '+' : ''}${seriesDelta})`)
          console.log(`   Authors: ${startStats.authors} → ${finalStats.authors} (${authorsDelta >= 0 ? '+' : ''}${authorsDelta})`)
          console.log('')
        } catch {
          console.log('')
          console.log('⚠️ Could not fetch final stats')
          console.log('')
        }

        process.exit(0)
      }
    }

    // When work was done, immediately check for more work (no sleep)
    // When idle, wait before polling again
    if (workDone) {
      console.log('')
      console.log('🔄 Work done, checking for more...')
      console.log('')
      // Minimal delay to avoid hammering the API
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } else {
      const waitTime = config.pollInterval * idlePollMultiplier
      console.log('')
      console.log(`💤 Sleeping for ${waitTime}s...`)
      console.log('')
      await new Promise((resolve) => setTimeout(resolve, waitTime * 1000))
    }
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

  // Parse --until-idle flag (exits after N consecutive idle polls)
  let untilIdle: number | null = null
  const untilIdleArg = args.find((arg) => arg.startsWith('--until-idle'))
  if (untilIdleArg) {
    if (untilIdleArg.includes('=')) {
      const value = parseInt(untilIdleArg.split('=')[1], 10)
      untilIdle = !isNaN(value) && value > 0 ? value : 1
    } else {
      untilIdle = 1 // Default to 1 if no value specified
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
  --until-idle[=N]       Exit after N consecutive idle polls (default: 1)
                         Use this for one-shot processing of queued items
  --help, -h             Show this help

Examples:
  bun worker                     Run continuously (default)
  bun worker --until-idle        Process queue and exit when done
  bun worker --until-idle=3      Exit after 3 consecutive idle polls

Prerequisites:
  Start Chrome with remote debugging:
  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

What the worker processes (in priority order):
  1. Queued URLs (from /ad/ UI) - books, series, or authors
  2. Books needing enrichment (detailsStatus: 'basic')
  3. Series URL discovery (pending series without sourceUrl)
  4. Series scraping (scrapeStatus: 'pending' or 'partial')
  5. Version upgrades (entities with scrapeVersion < current version)
`)
    process.exit(0)
  }

  return { dryRun, pollInterval, untilIdle }
}

// --- Entry point ---

const config = parseArgs()

runWorkerLoop(config).catch((error) => {
  console.error('🚨 Worker crashed:', error)
  process.exit(1)
})
