export type Provider = 'firecrawl' | 'playwright'

export type ScrapeOptions = {
  provider?: Provider
  headless?: boolean // Only applies to playwright
}

export type ScrapeResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }
