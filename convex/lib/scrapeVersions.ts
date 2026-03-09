/**
 * Server-side scrape version constants for Convex functions.
 * Keep this file in sync with lib/scraping/config.ts.
 */
export const SCRAPE_VERSIONS = {
  book: 1,
  series: 2,
  author: 1,
} as const

export type ScrapeVersions = typeof SCRAPE_VERSIONS
