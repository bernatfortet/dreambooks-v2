import type { PlaywrightCrawlingContext } from 'crawlee'
import { ensurePreferredFormat, parseBookFromPage } from '@/lib/scraping/domains/book/parse'
import { discoverBookLinks } from '@/lib/scraping/domains/book/discover'
import { detectAmazonPageType } from '@/lib/scraping/utils/page-type-detector'
import type { LocalScrapeSource } from '@/lib/scraping/local-source'
import { importBookToConvex } from '@/scripts/lib/convex-client'
import type { DemoRunResult } from '../types'

export async function processBookRequest(params: {
  context: PlaywrightCrawlingContext
  dryRun: boolean
  source: LocalScrapeSource
}): Promise<DemoRunResult> {
  const { context, dryRun, source } = params
  const { page, request, pushData } = context

  console.log('📖 Crawlee demo: book', request.url)

  await ensurePreferredFormat(page)

  const bookData = await parseBookFromPage(page, { scrapeEditions: true, maxEditions: 4 })
  if (!bookData.title) {
    const pageType = await detectAmazonPageType(page)
    throw new Error(`Failed to extract book title (detected page type: ${pageType})`)
  }

  if (!bookData.authors.length) {
    throw new Error('Failed to extract book authors')
  }

  const discoveries = discoverBookLinks(bookData)
  let entityId: string | undefined

  if (!dryRun) {
    const importResult = await importBookToConvex({
      scrapedData: bookData,
      amazonUrl: request.loadedUrl ?? request.url,
      source,
    })

    entityId = importResult.bookId
  }

  const result: DemoRunResult = {
    type: 'book',
    url: request.loadedUrl ?? request.url,
    saved: !dryRun,
    label: bookData.title,
    entityId,
    discoveryCount: discoveries.length,
  }

  await pushData(result)

  console.log('✅ Crawlee demo: book complete', result)

  return result
}
