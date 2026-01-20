// Types
export type { Provider, ScrapeOptions, ScrapeResult, Discovery } from './types'

// Config & Versions
export { SCRAPE_VERSIONS, SCRAPING_CONFIG } from './config'
export type { ScrapeVersions } from './config'

// Domains
export { scrapeBook, extractAsinFromUrl, parseBookFromPage } from './domains/book'
export type { BookData } from './domains/book'
export type { SeriesData, SeriesBookEntry } from './domains/series'
export type { AuthorData, AuthorBookEntry } from './domains/author'

// Providers (for advanced usage)
export { withBrowser, navigateWithRetry } from './providers/playwright'
export { extract, scrapeHtml } from './providers/firecrawl'
export {
  withCdpBrowser,
  withCdpNewTab,
  navigateWithRetry as navigateWithRetryCdp,
  getPageHtml,
  getTextContent,
} from './providers/agent-browser'
