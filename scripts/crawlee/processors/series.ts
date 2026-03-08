import type { PlaywrightCrawlingContext } from 'crawlee'
import { parseSeriesFromPage } from '@/lib/scraping/domains/series/parse'
import { discoverSeriesLinks } from '@/lib/scraping/domains/series/discover'
import type { LocalScrapeSource } from '@/lib/scraping/local-source'
import { saveSeriesToConvex } from '@/scripts/lib/convex-client'
import type { DemoRunResult } from '../types'

export async function processSeriesRequest(params: {
  context: PlaywrightCrawlingContext
  dryRun: boolean
  source: LocalScrapeSource
}): Promise<DemoRunResult> {
  const { context, dryRun, source } = params
  const { page, request, pushData } = context

  console.log('📚 Crawlee demo: series', request.url)

  const seriesData = await parseSeriesFromPage(page)
  if (!seriesData.name) {
    throw new Error('Failed to extract series name')
  }

  const discoveries = discoverSeriesLinks(seriesData)
  let entityId: string | undefined

  if (!dryRun) {
    const saveResult = await saveSeriesToConvex({
      seriesData,
      sourceUrl: request.loadedUrl ?? request.url,
      source,
    })

    entityId = saveResult.seriesId
  }

  const result: DemoRunResult = {
    type: 'series',
    url: request.loadedUrl ?? request.url,
    saved: !dryRun,
    label: seriesData.name,
    entityId,
    discoveryCount: discoveries.length,
    booksFound: seriesData.books.length,
  }

  await pushData(result)

  console.log('✅ Crawlee demo: series complete', result)

  return result
}
