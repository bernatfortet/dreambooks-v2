import { runCrawlerRequests } from '../crawler'
import type { DemoFlowConfig, DemoRunResult } from '../types'

export async function runDemoFlow(config: DemoFlowConfig): Promise<DemoRunResult[]> {
  const requests = createDemoRequests(config)

  console.log('')
  console.log('═'.repeat(60))
  console.log('🕷️ CRAWLEE AMAZON DEMO')
  console.log('═'.repeat(60))
  console.log(`   Dry run: ${config.dryRun}`)
  console.log(`   Headless: ${config.headless}`)
  console.log(`   Source: ${config.source}`)
  console.log(`   Requests: ${requests.length}`)
  if (config.bookUrl) console.log(`   Book URL: ${config.bookUrl}`)
  if (config.seriesUrl) console.log(`   Series URL: ${config.seriesUrl}`)
  if (config.authorUrl) console.log(`   Author URL: ${config.authorUrl}`)
  console.log('')

  const results = await runCrawlerRequests({
    requests,
    dryRun: config.dryRun,
    headless: config.headless,
    source: config.source,
  })

  printSummary(results)

  return results
}

function createDemoRequests(config: DemoFlowConfig) {
  const requests = []

  if (config.bookUrl) {
    requests.push({
      url: config.bookUrl,
      uniqueKey: `book:${config.bookUrl}`,
      userData: { type: 'book' as const },
    })
  }

  if (config.seriesUrl) {
    requests.push({
      url: config.seriesUrl,
      uniqueKey: `series:${config.seriesUrl}`,
      userData: { type: 'series' as const },
    })
  }

  if (config.authorUrl) {
    requests.push({
      url: config.authorUrl,
      uniqueKey: `author:${config.authorUrl}`,
      userData: { type: 'author' as const },
    })
  }

  return requests
}

function printSummary(results: DemoRunResult[]): void {
  console.log('')
  console.log('═'.repeat(60))
  console.log('✅ CRAWLEE DEMO COMPLETE')
  console.log('═'.repeat(60))

  for (const result of results) {
    console.log(`${getTypeEmoji(result.type)} ${result.type}: ${result.label}`)
    console.log(`   URL: ${result.url}`)
    console.log(`   Saved: ${result.saved}`)

    if (result.entityId) {
      console.log(`   Entity ID: ${result.entityId}`)
    }

    if (result.discoveryCount !== undefined) {
      console.log(`   Discoveries: ${result.discoveryCount}`)
    }

    if (result.booksFound !== undefined) {
      console.log(`   Books found: ${result.booksFound}`)
    }

    if (result.booksLinked !== undefined) {
      console.log(`   Books linked: ${result.booksLinked}`)
    }

    console.log('')
  }
}

function getTypeEmoji(type: DemoRunResult['type']): string {
  if (type === 'book') return '📖'
  if (type === 'series') return '📚'
  return '👤'
}
