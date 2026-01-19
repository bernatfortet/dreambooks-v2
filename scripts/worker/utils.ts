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
