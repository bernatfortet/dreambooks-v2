import { chromium, Browser, Page, BrowserContext } from 'playwright'
import { ScrapeResult } from '../../types'

const DEFAULT_CDP_URL = 'http://localhost:9222'

type CdpConfig = {
  cdpUrl?: string
  timeout?: number
}

type ConnectedBrowser = {
  browser: Browser
  context: BrowserContext
  page: Page
}

/**
 * Connect to an existing browser via CDP (Chrome DevTools Protocol).
 *
 * To start Chrome with remote debugging:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *
 * Or on macOS with a separate profile:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *     --remote-debugging-port=9222 \
 *     --user-data-dir=/tmp/chrome-debug-profile
 */
async function connectToBrowser(config?: CdpConfig): Promise<ConnectedBrowser> {
  const cdpUrl = config?.cdpUrl ?? DEFAULT_CDP_URL
  const timeout = config?.timeout ?? 30000

  console.log(`🔌 Connecting to browser at ${cdpUrl}...`)

  const browser = await chromium.connectOverCDP(cdpUrl, { timeout })
  const contexts = browser.contexts()

  if (contexts.length === 0) {
    throw new Error('No browser contexts found. Make sure your browser has at least one window open.')
  }

  // Use the first context (default browser context with cookies/session)
  const context = contexts[0]
  const pages = context.pages()

  // Use existing page or create a new one
  const page = pages.length > 0 ? pages[0] : await context.newPage()

  console.log('✅ Connected to browser')

  return { browser, context, page }
}

/**
 * Execute an action on a browser connected via CDP.
 * This preserves the browser session (doesn't close it) since it's user-controlled.
 */
export async function withCdpBrowser<T>(params: {
  config?: CdpConfig
  action: (page: Page) => Promise<T>
}): Promise<ScrapeResult<T>> {
  const { config, action } = params

  try {
    const { page } = await connectToBrowser(config)
    const result = await action(page)

    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('🚨 CDP browser error:', message)

    return { success: false, error: message }
  }
  // Note: We intentionally don't close the browser since it's externally managed
}

/**
 * Connect to CDP browser and use a NEW tab for the action.
 * The new tab is closed after the action completes.
 */
export async function withCdpNewTab<T>(params: {
  config?: CdpConfig
  action: (page: Page) => Promise<T>
}): Promise<ScrapeResult<T>> {
  const { config, action } = params
  let newPage: Page | null = null

  try {
    const { context } = await connectToBrowser(config)

    // Create a new tab for this action
    newPage = await context.newPage()
    console.log('📑 Created new tab')

    const result = await action(newPage)

    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('🚨 CDP browser error:', message)

    return { success: false, error: message }
  } finally {
    // Close the tab we created, but keep the browser running
    if (newPage) {
      console.log('🗑️ Closing tab')
      await newPage.close()
    }
  }
}

export async function navigateWithRetry(params: {
  page: Page
  url: string
  maxRetries?: number
  waitMs?: number
}): Promise<void> {
  const { page, url, maxRetries = 3, waitMs = 2000 } = params

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌀 Navigating to ${url} (attempt ${attempt}/${maxRetries})...`)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })

      // Wait for page to stabilize
      await page.waitForTimeout(waitMs)

      console.log('✅ Page loaded successfully')
      return
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')
      console.warn(`⚠️ Navigation attempt ${attempt} failed: ${lastError.message}`)

      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000
        console.log(`🌀 Retrying in ${backoff}ms...`)
        await new Promise((resolve) => setTimeout(resolve, backoff))
      }
    }
  }

  throw lastError ?? new Error('Navigation failed after all retries')
}

/**
 * Get the HTML content of the current page.
 */
export async function getPageHtml(page: Page): Promise<string> {
  return await page.content()
}

/**
 * Wait for a selector and get its text content.
 */
export async function getTextContent(page: Page, selector: string): Promise<string | null> {
  try {
    await page.waitForSelector(selector, { timeout: 3000 })
    return await page.textContent(selector)
  } catch {
    return null
  }
}

// Re-export Page type for consumers
export type { Page } from 'playwright'
