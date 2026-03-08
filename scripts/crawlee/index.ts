#!/usr/bin/env bunx tsx

import * as dotenv from 'dotenv'
import { DEFAULT_LOCAL_SCRAPE_SOURCE, LOCAL_SCRAPE_SOURCES } from '@/lib/scraping/local-source'
import { runDemoFlow } from './flows/demo'
import { DEMO_URLS, type DemoFlowConfig } from './types'

dotenv.config({ path: '.env.local' })
dotenv.config()

async function main(): Promise<void> {
  const config = parseArgs()
  await runDemoFlow(config)
}

function parseArgs(): DemoFlowConfig {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  return {
    dryRun: args.includes('--dry-run'),
    headless: parseHeadlessArg(args),
    source: LOCAL_SCRAPE_SOURCES.crawlee ?? DEFAULT_LOCAL_SCRAPE_SOURCE,
    bookUrl: parseStringFlag(args, '--book-url') ?? DEMO_URLS.book,
    seriesUrl: parseStringFlag(args, '--series-url') ?? DEMO_URLS.series,
    authorUrl: parseStringFlag(args, '--author-url') ?? DEMO_URLS.author,
  }
}

function parseHeadlessArg(args: string[]): boolean {
  const flagValue = parseStringFlag(args, '--headless')
  if (flagValue === 'false') return false
  if (flagValue === 'true') return true
  return true
}

function parseStringFlag(args: string[], flagName: string): string | null {
  const prefixedFlag = `${flagName}=`
  const matchingArg = args.find((arg) => arg.startsWith(prefixedFlag))

  if (!matchingArg) {
    return null
  }

  return matchingArg.slice(prefixedFlag.length)
}

function printHelp(): void {
  console.log(`
Crawlee Amazon demo flow

Usage:
  bunx tsx scripts/crawlee/index.ts [options]

Options:
  --dry-run                 Parse pages without saving to Convex
  --headless=true|false     Run Playwright headless (default: true)
  --book-url=URL            Override the demo book URL
  --series-url=URL          Override the demo series URL
  --author-url=URL          Override the demo author URL
  --help, -h                Show this help

Defaults:
  Book:   ${DEMO_URLS.book}
  Series: ${DEMO_URLS.series}
  Author: ${DEMO_URLS.author}
`)
}

main().catch((error) => {
  console.error('🚨 Crawlee demo crashed:', error)
  process.exit(1)
})
