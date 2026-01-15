import { chromium } from 'playwright-extra'
import { Browser, Page } from 'playwright'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { ScrapeResult } from '../../types'

// Apply stealth plugin to bypass bot detection
chromium.use(StealthPlugin())

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

type BrowserConfig = {
  headless?: boolean
  userAgent?: string
}

export async function withBrowser<T>(params: {
  config?: BrowserConfig
  action: (page: Page) => Promise<T>
}): Promise<ScrapeResult<T>> {
  const { config, action } = params
  const headless = config?.headless ?? true
  const userAgent = config?.userAgent ?? DEFAULT_USER_AGENT

  let browser: Browser | null = null

  try {
    console.log('🚀 Launching browser...')
    browser = await chromium.launch({ headless })

    const context = await browser.newContext({ userAgent })
    const page = await context.newPage()

    const result = await action(page)

    return { success: true, data: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('🚨 Browser error:', message)

    return { success: false, error: message }
  } finally {
    if (browser) {
      console.log('🌀 Closing browser...')
      await browser.close()
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
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

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

// Re-export Page type for consumers
export type { Page } from 'playwright'
