/**
 * Centralized configuration for the scraping system.
 * All magic numbers and tunable constants should be defined here.
 *
 * IMPORTANT: Keep in sync with lib/scraping/config.ts
 * (lib/ runs locally, convex/ runs on Convex servers - can't share files)
 */

export const SCRAPING_CONFIG = {
  queue: {
    /** Maximum discoveries to process per mutation call (prevents queue floods) */
    maxDiscoveriesPerCall: 50,
    /** Lease duration in milliseconds (how long a worker can hold an item) */
    leaseDurationMs: 20 * 60 * 1000, // 20 minutes
    /** How old (in ms) completed/errored items should be before cleanup */
    staleItemCleanupAgeMs: 24 * 60 * 60 * 1000, // 24 hours
  },
  delays: {
    /** Human-like delay range for general actions (ms) */
    human: { min: 2000, max: 4000 },
    /** Delay between processing items (ms) */
    betweenItems: { min: 5000, max: 10000 },
    /** Delay before processing series items (ms) */
    beforeSeries: { min: 3000, max: 6000 },
    /** Delay after series processing (ms) */
    afterSeries: { min: 8000, max: 15000 },
  },
  worker: {
    /** Default polling interval in seconds */
    defaultPollIntervalSeconds: 20,
    /** Multiplier for poll interval when no work was done */
    idlePollMultiplier: 2,
    /** Maximum items to fetch per poll for queue processing */
    queueBatchSize: 3,
    /** Maximum items to fetch for enrichment */
    enrichmentBatchSize: 3,
    /** Maximum series to fetch for URL discovery */
    seriesDiscoveryBatchSize: 2,
    /** Maximum series to fetch for scraping */
    seriesScrapingBatchSize: 2,
  },
  navigation: {
    /** Maximum retries for page navigation */
    maxRetries: 3,
    /** Navigation timeout in milliseconds */
    timeoutMs: 30000,
    /** Wait time after page load (ms) */
    waitAfterLoadMs: 2000,
  },
  extraction: {
    /** Timeout for checking element visibility (ms) - should be fast */
    visibilityTimeoutMs: 500,
    /** Timeout for getting text content from visible elements (ms) */
    textContentTimeoutMs: 1000,
    /** Timeout for getting attributes from visible elements (ms) */
    attributeTimeoutMs: 1000,
    /** Timeout for clicking elements that navigate (ms) */
    clickNavigateTimeoutMs: 3000,
  },
  priorities: {
    /** Priority for series discovered from book pages (lower = higher priority) */
    seriesFromBook: 20,
    /** Priority for authors discovered from book pages */
    authorFromBook: 40,
  },
  debug: {
    /** Whether to dump page HTML for debugging */
    dumpHtml: true,
    /** Directory to dump HTML files (relative to workspace root) */
    htmlDumpDir: '.cursor/debug-html',
  },
}

// Type export for consumers
export type ScrapingConfig = typeof SCRAPING_CONFIG
