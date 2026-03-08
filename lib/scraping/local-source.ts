export const LOCAL_SCRAPE_SOURCES = {
  playwright: 'playwright-local',
  crawlee: 'crawlee-playwright',
} as const

export type LocalScrapeSource = (typeof LOCAL_SCRAPE_SOURCES)[keyof typeof LOCAL_SCRAPE_SOURCES]

export const DEFAULT_LOCAL_SCRAPE_SOURCE = LOCAL_SCRAPE_SOURCES.playwright
