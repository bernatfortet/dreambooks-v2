// Types
export type { Provider, ScrapeOptions, ScrapeResult } from './types'

// Domains
export { scrapeBook, extractAsinFromUrl, parseBookFromPage } from './domains/book'
export type { BookData } from './domains/book'
export type { SeriesData, SeriesBookEntry } from './domains/series'
export type { AuthorData, AuthorBookEntry } from './domains/author'

// Providers (for advanced usage)
export { withBrowser, navigateWithRetry } from './providers/playwright'
export { extract, scrapeHtml } from './providers/firecrawl'
