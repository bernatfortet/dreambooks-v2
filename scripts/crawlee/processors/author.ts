import type { PlaywrightCrawlingContext } from 'crawlee'
import { parseAuthorFromPage } from '@/lib/scraping/domains/author/parse'
import { discoverAuthorLinks } from '@/lib/scraping/domains/author/discover'
import type { LocalScrapeSource } from '@/lib/scraping/local-source'
import { importAuthorToConvex } from '@/scripts/lib/convex-client'
import type { DemoRunResult } from '../types'

export async function processAuthorRequest(params: {
  context: PlaywrightCrawlingContext
  dryRun: boolean
  source: LocalScrapeSource
}): Promise<DemoRunResult> {
  const { context, dryRun, source } = params
  const { page, request, pushData } = context

  console.log('👤 Crawlee demo: author', request.url)

  const authorData = await parseAuthorFromPage(page)
  if (!authorData.name) {
    throw new Error('Failed to extract author name')
  }

  if (!authorData.amazonAuthorId) {
    throw new Error('Failed to extract Amazon author ID')
  }

  const discoveries = discoverAuthorLinks(authorData)
  let entityId: string | undefined
  let booksLinked = 0

  if (!dryRun) {
    const importResult = await importAuthorToConvex({
      authorData,
      sourceUrl: request.loadedUrl ?? request.url,
      source,
    })

    entityId = importResult.authorId
    booksLinked = importResult.booksLinked
  }

  const result: DemoRunResult = {
    type: 'author',
    url: request.loadedUrl ?? request.url,
    saved: !dryRun,
    label: authorData.name,
    entityId,
    discoveryCount: discoveries.length,
    booksLinked,
  }

  await pushData(result)

  console.log('✅ Crawlee demo: author complete', result)

  return result
}
