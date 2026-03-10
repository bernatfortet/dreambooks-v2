/**
 * Scrape versions for each entity type.
 *
 * IMPORTANT: Keep in sync with lib/scraping/config.ts
 * (convex/ runs on Convex servers, lib/ runs locally - can't share files)
 *
 * See lib/scraping/config.ts for full version guidelines.
 */
export const SCRAPE_VERSIONS = {
  book: 1,
  series: 2, // v2: store canonical sourceUrl on re-scrape
  author: 1,
} as const
