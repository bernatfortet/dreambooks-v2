import { writeFileSync } from 'fs'
import { join } from 'path'

// Track scraping count for dynamic delays
let scrapingCount = 0

/**
 * Increment scraping count (call after each successful scrape).
 */
export function incrementScrapingCount(): void {
  scrapingCount++
}

/**
 * Get current scraping count.
 */
export function getScrapingCount(): number {
  return scrapingCount
}

/**
 * Random delay between min and max milliseconds.
 */
export function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

/**
 * Get dynamic delay range based on scraping count.
 * First 5 scrapes are fast (for testing), then switches to normal delays.
 */
function getDynamicDelayRange(originalMin: number, originalMax: number): { min: number; max: number } {
  // First 5 scrapes: very fast (0-200ms)
  if (scrapingCount < 5) {
    return { min: 0, max: 200 }
  }

  // After 5 scrapes: use 2 seconds as requested
  return { min: 2000, max: 2000 }
}

/**
 * Sleep for a random duration with optional label.
 * Uses dynamic delays based on scraping count (fast for first 5, then 2s).
 */
export async function humanDelay(minMs: number, maxMs: number, label?: string): Promise<void> {
  const { min, max } = getDynamicDelayRange(minMs, maxMs)
  const delay = randomDelay(min, max)
  if (label) {
    console.log(`⏳ ${label} (${(delay / 1000).toFixed(1)}s)...`)
  }
  await new Promise((resolve) => setTimeout(resolve, delay))
}

/**
 * Format a timestamp as a local time string.
 */
export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString()
}

/**
 * Truncate a string to a maximum length.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

// Worker ID generated once per process
let workerId: string | null = null

/**
 * Get a unique worker ID for this process.
 * Combines hostname, PID, and timestamp for uniqueness.
 */
export function getWorkerId(): string {
  if (!workerId) {
    const hostname = process.env.HOSTNAME ?? 'local'
    const pid = process.pid
    const timestamp = Date.now().toString(36)
    workerId = `${hostname}-${pid}-${timestamp}`
  }

  return workerId
}

// --- Rolling Log System ---

type ItemLog = {
  timestamp: string
  type: 'book' | 'series' | 'author' | 'enrichment'
  url: string
  referrerUrl?: string
  referrerReason?: string
  logs: string[]
  durationMs: number
  success: boolean
}

const LOG_HISTORY: ItemLog[] = []
const MAX_HISTORY = 20
let currentLogs: string[] = []
let currentStart = 0

/**
 * Start capturing logs for a new item.
 */
export function startItemLog(): void {
  currentLogs = []
  currentStart = Date.now()
}

/**
 * Log a message (writes to console and captures for rolling log).
 */
export function log(message: string): void {
  console.log(message)
  currentLogs.push(`[${new Date().toISOString()}] ${message}`)
}

/**
 * Log an error (writes to stderr and captures for rolling log).
 */
export function logError(prefix: string, error: unknown): void {
  const message = `${prefix}: ${formatErrorForLog(error)}`
  console.error(message)
  currentLogs.push(`[${new Date().toISOString()}] ${message}`)
}

/**
 * Finish capturing logs for the current item and write to file.
 */
export function finishItemLog(type: ItemLog['type'], url: string, success: boolean, referrerUrl?: string, referrerReason?: string): void {
  LOG_HISTORY.push({
    timestamp: new Date().toISOString(),
    type,
    url,
    referrerUrl,
    referrerReason,
    logs: currentLogs,
    durationMs: Date.now() - currentStart,
    success,
  })

  if (LOG_HISTORY.length > MAX_HISTORY) LOG_HISTORY.shift()

  const logPath = join(process.cwd(), 'worker-logs.txt')
  writeFileSync(logPath, formatLogHistory(), 'utf-8')
}

function formatLogHistory(): string {
  return LOG_HISTORY.map(
    (item, i) =>
      `${'='.repeat(60)}\n` +
      `[${i + 1}/${LOG_HISTORY.length}] ${item.type.toUpperCase()}: ${item.url}\n` +
      `Time: ${item.timestamp} | Duration: ${(item.durationMs / 1000).toFixed(1)}s | ${item.success ? 'SUCCESS' : 'FAILED'}\n` +
      (item.referrerUrl ? `Referrer: ${truncate(item.referrerUrl, 50)}${item.referrerReason ? ` (${item.referrerReason})` : ''}\n` : '') +
      `${'='.repeat(60)}\n` +
      item.logs.join('\n'),
  ).join('\n\n')
}

function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return typeof error === 'string' ? error : JSON.stringify(error)
}

/**
 * Check if a book is targeted at a juvenile audience.
 * Amazon consistently shows age range or grade level for children's books.
 * If neither is present, the book is likely not juvenile.
 */
export function isJuvenileBook(bookData: {
  ageRangeMin?: number | null
  ageRangeMax?: number | null
  gradeLevelMin?: number | null
  gradeLevelMax?: number | null
}): boolean {
  const hasAgeRange = bookData.ageRangeMin != null || bookData.ageRangeMax != null
  const hasGradeLevel = bookData.gradeLevelMin != null || bookData.gradeLevelMax != null
  return hasAgeRange || hasGradeLevel
}
