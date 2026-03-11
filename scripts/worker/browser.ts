import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { humanDelay, randomDelay } from './utils'

const CDP_URL = 'http://localhost:9222'
const CONNECTION_TIMEOUT = 10000 // 10 seconds

export type BrowserConnection = {
  browser: Browser
  context: BrowserContext
}

/**
 * Check if port 9222 is accessible before attempting connection.
 */
async function checkPortAccessible(): Promise<boolean> {
  try {
    const response = await fetch(`${CDP_URL}/json/version`, {
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Connect to a running Chrome instance via CDP.
 */
export async function connectToBrowser(): Promise<BrowserConnection> {
  console.log(`🔌 Connecting to browser at ${CDP_URL}...`)

  // Pre-check: verify port is accessible
  const portAccessible = await checkPortAccessible()
  if (!portAccessible) {
    throw new Error(
      `Cannot connect to Chrome DevTools Protocol on port 9222.\n` +
      `Make sure Chrome is running with remote debugging enabled:\n` +
      `  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile\n` +
      `Or use: bun run google`
    )
  }

  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: CONNECTION_TIMEOUT })
    const contexts = browser.contexts()

    if (contexts.length === 0) {
      throw new Error('No browser contexts found. Make sure your browser has at least one window open.')
    }

    const context = contexts[0]
    console.log('✅ Connected to browser')

    return { browser, context }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
        throw new Error(
          `Connection timeout. Chrome may not be running with remote debugging.\n` +
          `Start Chrome with: bun run google\n` +
          `Original error: ${error.message}`
        )
      }
      throw error
    }
    throw new Error(`Unknown error connecting to browser: ${error}`)
  }
}

/**
 * Check if an error indicates the browser/page/context was closed.
 */
export function isClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('target page, context or browser has been closed') ||
    message.includes('browser has been closed') ||
    message.includes('context has been closed') ||
    message.includes('page has been closed') ||
    message.includes('target closed') ||
    message.includes('connection closed')
  )
}

/**
 * Check if a page is still usable.
 */
export async function isPageHealthy(page: Page): Promise<boolean> {
  try {
    // Try a simple operation to verify the page is still connected
    await page.evaluate(() => true)
    return true
  } catch {
    return false
  }
}

/**
 * Manages a browser connection with auto-reconnect capability.
 * Use this to get a page that will automatically heal if the browser/tab is closed.
 */
export class PageManager {
  private connection: BrowserConnection | null = null
  private page: Page | null = null

  /**
   * Get a healthy page, reconnecting if necessary.
   */
  async getPage(): Promise<Page> {
    // Check if current page is still healthy
    if (this.page) {
      const healthy = await isPageHealthy(this.page)
      if (healthy) return this.page
      console.log('🔄 Page is no longer healthy, reconnecting...')
    }

    // Need to reconnect
    await this.reconnect()

    if (!this.page) {
      throw new Error('Failed to get a healthy page after reconnection')
    }

    return this.page
  }

  /**
   * Force reconnect to the browser and create a new page.
   */
  async reconnect(): Promise<void> {
    // Clean up old connection
    if (this.page) {
      try {
        await this.page.close()
      } catch {
        // Ignore errors when closing an already-closed page
      }
      this.page = null
    }

    // Reconnect to browser
    console.log('🔄 Reconnecting to browser...')
    this.connection = await connectToBrowser()
    this.page = await this.connection.context.newPage()
    console.log('📑 Created new scraping tab')
  }

  /**
   * Initialize the connection (call once at startup).
   */
  async initialize(): Promise<Page> {
    this.connection = await connectToBrowser()
    this.page = await this.connection.context.newPage()
    console.log('📑 Created scraping tab')
    return this.page
  }
}

export async function reconnectPageForRetry(params: {
  attempt: number
  pageManager?: PageManager
  reason: string
}): Promise<Page | null> {
  const { attempt, pageManager, reason } = params

  if (!pageManager || attempt >= 2) return null

  console.log(`   🔄 ${reason}, reconnecting and retrying...`)
  await pageManager.reconnect()

  const page = await pageManager.getPage()
  return page
}

export async function recoverPageIfClosed(params: {
  attempt: number
  page: Page
  pageManager?: PageManager
  reason: string
}): Promise<Page | null> {
  const { attempt, page, pageManager, reason } = params

  if (attempt >= 2) return null

  const healthy = await isPageHealthy(page)
  if (healthy) return null

  const recoveredPage = await reconnectPageForRetry({
    attempt,
    pageManager,
    reason: `Page closed during ${reason}`,
  })

  return recoveredPage
}

/**
 * Simulate human-like scrolling behavior on a page.
 */
export async function simulateHumanBehavior(page: Page): Promise<void> {
  const scrollAmount = randomDelay(100, 400)
  await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount)
  await humanDelay(500, 1500)

  if (Math.random() > 0.6) {
    const scrollBack = randomDelay(50, 150)
    await page.evaluate((amount) => window.scrollBy(0, -amount), scrollBack)
    await humanDelay(300, 800)
  }
}

/**
 * Navigate to a URL with retry logic and human-like behavior.
 * Returns { success, needsReconnect } to indicate if the page needs to be recreated.
 */
export async function navigateWithRetry(params: {
  page: Page
  url: string
  maxRetries?: number
}): Promise<{ success: boolean; needsReconnect?: boolean }> {
  const { page, url, maxRetries = 3 } = params

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   🌀 Navigating (attempt ${attempt}/${maxRetries})...`)

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await humanDelay(2000, 4000)
      await simulateHumanBehavior(page)

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`   ⚠️ Navigation failed: ${message}`)

      // Check if the browser/page was closed - needs reconnection
      if (isClosedError(error)) {
        console.log('   🔌 Browser/page closed, will reconnect...')
        return { success: false, needsReconnect: true }
      }

      if (attempt < maxRetries) {
        await humanDelay(3000, 6000)
      }
    }
  }

  return { success: false }
}

/**
 * Navigate with automatic reconnection if the page is closed.
 */
export async function navigateWithReconnect(params: {
  pageManager: PageManager
  url: string
  maxRetries?: number
}): Promise<{ success: boolean; page: Page }> {
  const { pageManager, url, maxRetries = 3 } = params

  let page = await pageManager.getPage()
  const result = await navigateWithRetry({ page, url, maxRetries })

  if (result.needsReconnect) {
    console.log('   🔄 Reconnecting and retrying navigation...')
    await pageManager.reconnect()
    page = await pageManager.getPage()

    const retryResult = await navigateWithRetry({ page, url, maxRetries })
    return { success: retryResult.success, page }
  }

  return { success: result.success, page }
}

export type { Page } from 'playwright'
