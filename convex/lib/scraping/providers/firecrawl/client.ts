'use node'

import FirecrawlApp from '@mendable/firecrawl-js'
import { ScrapeResult } from '@/lib/scraping/types'

let firecrawlInstance: FirecrawlApp | null = null

function getFirecrawlClient(): FirecrawlApp {
  if (firecrawlInstance) return firecrawlInstance

  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY environment variable is not set')

  firecrawlInstance = new FirecrawlApp({ apiKey })

  return firecrawlInstance
}

export type ExtractOptions<T> = {
  url: string
  schema: Record<string, unknown>
  prompt: string
}

export async function extract<T>(options: ExtractOptions<T>): Promise<ScrapeResult<T>> {
  const { url, schema, prompt } = options

  try {
    const client = getFirecrawlClient()

    console.log('🌀 Extracting with Firecrawl...', { url })

    const result = await client.extract({
      urls: [url],
      schema,
      prompt,
    })

    if (!result.success || !result.data) {
      console.error('🚨 Firecrawl extraction failed', { error: result.error })

      return { success: false, error: result.error ?? 'Extraction failed' }
    }

    console.log('✅ Firecrawl extraction complete')

    return { success: true, data: result.data as T }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('🚨 Firecrawl error:', message)

    return { success: false, error: message }
  }
}

// TODO: Implement scrapeHtml when needed
// The Firecrawl API for raw HTML scraping needs investigation
// For now, we only use the extract() function which works with LLM extraction
export async function scrapeHtml(_url: string): Promise<ScrapeResult<string>> {
  return { success: false, error: 'scrapeHtml not implemented - use extract() instead' }
}
