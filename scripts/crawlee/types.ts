import type { LocalScrapeSource } from '@/lib/scraping/local-source'

export type CrawleeTargetType = 'book' | 'series' | 'author'

export type DemoRequestUserData = {
  type: CrawleeTargetType
}

export type DemoFlowConfig = {
  dryRun: boolean
  headless: boolean
  source: LocalScrapeSource
  bookUrl: string
  seriesUrl: string
  authorUrl: string
}

export type DemoRunResult = {
  type: CrawleeTargetType
  url: string
  saved: boolean
  label: string
  entityId?: string
  discoveryCount?: number
  booksFound?: number
  booksLinked?: number
}

export const DEMO_URLS = {
  book: 'https://www.amazon.com/gp/product/0064440206',
  series: 'https://www.amazon.com/dp/B09HCDXVS2?binding=paperback',
  author: 'https://www.amazon.com/arnold-lobel/e/B000APNG74',
} as const
