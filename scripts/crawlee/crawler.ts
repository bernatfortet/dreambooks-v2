import { PlaywrightCrawler } from 'crawlee'
import type { PlaywrightCrawlingContext } from 'crawlee'
import type { LocalScrapeSource } from '@/lib/scraping/local-source'
import { processAuthorRequest } from './processors/author'
import { processBookRequest } from './processors/book'
import { processSeriesRequest } from './processors/series'
import type { DemoRequestUserData, DemoRunResult } from './types'

type DemoRequest = {
  url: string
  uniqueKey: string
  userData: DemoRequestUserData
}

export async function runCrawlerRequests(params: {
  requests: DemoRequest[]
  dryRun: boolean
  headless: boolean
  source: LocalScrapeSource
}): Promise<DemoRunResult[]> {
  const results: DemoRunResult[] = []
  const failedRequests: Array<{ type: DemoRequestUserData['type']; url: string; errors: string[] }> = []
  const { requests, dryRun, headless, source } = params

  async function handleRequest(context: PlaywrightCrawlingContext): Promise<void> {
    const result = await dispatchRequest({
      context,
      dryRun,
      source,
    })

    results.push(result)
  }

  async function handleFailedRequest(context: PlaywrightCrawlingContext): Promise<void> {
    const requestType = getRequestType(context)
    const errors = context.request.errorMessages

    console.error('🚨 Crawlee demo request failed', {
      type: requestType,
      url: context.request.url,
      errors,
    })

    failedRequests.push({
      type: requestType,
      url: context.request.url,
      errors,
    })
  }

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    maxRequestRetries: 1,
    navigationTimeoutSecs: 45,
    requestHandlerTimeoutSecs: 180,
    launchContext: {
      launchOptions: {
        headless,
      },
    },
    requestHandler: handleRequest,
    failedRequestHandler: handleFailedRequest,
  })

  await crawler.run(requests)

  if (failedRequests.length > 0) {
    throw new Error(formatFailedRequestsError(failedRequests))
  }

  return results
}

async function dispatchRequest(params: {
  context: PlaywrightCrawlingContext
  dryRun: boolean
  source: LocalScrapeSource
}): Promise<DemoRunResult> {
  const { context, dryRun, source } = params
  const requestType = getRequestType(context)

  if (requestType === 'book') {
    return await processBookRequest({ context, dryRun, source })
  }

  if (requestType === 'series') {
    return await processSeriesRequest({ context, dryRun, source })
  }

  return await processAuthorRequest({ context, dryRun, source })
}

function getRequestType(context: PlaywrightCrawlingContext): DemoRequestUserData['type'] {
  const userData = context.request.userData as Partial<DemoRequestUserData>

  if (userData.type === 'book' || userData.type === 'series' || userData.type === 'author') {
    return userData.type
  }

  throw new Error(`Unsupported demo request type for ${context.request.url}`)
}

function formatFailedRequestsError(
  failedRequests: Array<{ type: DemoRequestUserData['type']; url: string; errors: string[] }>,
): string {
  const lines = failedRequests.flatMap((request, index) => {
    const errorLines =
      request.errors.length > 0 ? request.errors.map((error) => `    - ${error}`) : ['    - Unknown error']

    return [
      `${index + 1}. ${request.type} ${request.url}`,
      ...errorLines,
    ]
  })

  return `Crawlee demo failed for ${failedRequests.length} request(s):\n${lines.join('\n')}`
}
