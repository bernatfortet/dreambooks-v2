export type Provider = 'firecrawl' | 'playwright' | 'agent-browser'

export type ScrapeOptions = {
  provider?: Provider
  headless?: boolean // Only applies to playwright
}

export type ScrapeResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * A discovered entity link found during scraping.
 * Used by discovery extractors to report links to other entities.
 */
export type Discovery = {
  type: 'book' | 'series' | 'author'
  url: string
  metadata?: { name?: string; imageUrl?: string; position?: number }
  priority: number // Lower = higher priority
  source: string // Where discovered: 'book-series-link', 'series-listing', 'author-page', etc.
}
