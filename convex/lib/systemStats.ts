import type { DatabaseReader } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'

export const GLOBAL_SYSTEM_STATS_KEY = 'global'

export type ScrapeQueueStatus = Doc<'scrapeQueue'>['status']
export type BookIntakeStatus = Doc<'bookIntake'>['status']

export type EntityCounts = {
  books: number
  series: number
  authors: number
}

export type ScrapeQueueCounts = {
  pending: number
  processing: number
  complete: number
  error: number
  total: number
}

export type BookIntakeCounts = {
  pending: number
  researching: number
  readyToScrape: number
  waitingForScrape: number
  linked: number
  needsReview: number
  failed: number
  total: number
}

export type SystemStatsSnapshot = {
  key: string
  entityCounts: EntityCounts
  scrapeQueue: ScrapeQueueCounts
  bookIntake: BookIntakeCounts
  updatedAt: number
}

export function buildEmptySystemStats(now: number): SystemStatsSnapshot {
  return {
    key: GLOBAL_SYSTEM_STATS_KEY,
    entityCounts: {
      books: 0,
      series: 0,
      authors: 0,
    },
    scrapeQueue: {
      pending: 0,
      processing: 0,
      complete: 0,
      error: 0,
      total: 0,
    },
    bookIntake: {
      pending: 0,
      researching: 0,
      readyToScrape: 0,
      waitingForScrape: 0,
      linked: 0,
      needsReview: 0,
      failed: 0,
      total: 0,
    },
    updatedAt: now,
  }
}

export async function getStoredSystemStats(db: DatabaseReader) {
  return await db
    .query('systemStats')
    .withIndex('by_key', (query) => query.eq('key', GLOBAL_SYSTEM_STATS_KEY))
    .unique()
}

export async function readSystemStatsWithFallback(db: DatabaseReader) {
  const existingStats = await getStoredSystemStats(db)
  if (existingStats) return existingStats

  const [books, series, authors, scrapeQueueItems, intakeItems] = await Promise.all([
    db.query('books').collect(),
    db.query('series').collect(),
    db.query('authors').collect(),
    db.query('scrapeQueue').collect(),
    db.query('bookIntake').collect(),
  ])

  return {
    key: GLOBAL_SYSTEM_STATS_KEY,
    entityCounts: {
      books: books.length,
      series: series.length,
      authors: authors.length,
    },
    scrapeQueue: countScrapeQueueStatuses(scrapeQueueItems),
    bookIntake: countBookIntakeStatuses(intakeItems),
    updatedAt: Date.now(),
  }
}

export function countScrapeQueueStatuses(items: Array<{ status: ScrapeQueueStatus }>): ScrapeQueueCounts {
  const counts: ScrapeQueueCounts = {
    pending: 0,
    processing: 0,
    complete: 0,
    error: 0,
    total: items.length,
  }

  for (const item of items) {
    if (item.status === 'pending') counts.pending += 1
    if (item.status === 'processing') counts.processing += 1
    if (item.status === 'complete') counts.complete += 1
    if (item.status === 'error') counts.error += 1
  }

  return counts
}

export function countBookIntakeStatuses(items: Array<{ status: BookIntakeStatus }>): BookIntakeCounts {
  const counts: BookIntakeCounts = {
    pending: 0,
    researching: 0,
    readyToScrape: 0,
    waitingForScrape: 0,
    linked: 0,
    needsReview: 0,
    failed: 0,
    total: items.length,
  }

  for (const item of items) {
    if (item.status === 'pending') counts.pending += 1
    if (item.status === 'researching') counts.researching += 1
    if (item.status === 'ready_to_scrape') counts.readyToScrape += 1
    if (item.status === 'waiting_for_scrape') counts.waitingForScrape += 1
    if (item.status === 'linked') counts.linked += 1
    if (item.status === 'needs_review') counts.needsReview += 1
    if (item.status === 'failed') counts.failed += 1
  }

  return counts
}

export function applyDelta(value: number, delta: number) {
  return Math.max(0, value + delta)
}
