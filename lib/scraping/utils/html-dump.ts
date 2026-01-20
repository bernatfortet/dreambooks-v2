import type { Page } from 'playwright'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'

/**
 * Dump page HTML to disk for debugging selector issues.
 * Creates timestamped HTML files that can be inspected offline.
 */
export async function dumpPageHtml(page: Page, label: string, options?: { includeOuterHtml?: boolean }): Promise<string | null> {
  if (!SCRAPING_CONFIG.debug.dumpHtml) {
    return null
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeLabel = label.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50)
    const filename = `${timestamp}_${safeLabel}.html`

    const dumpDir = join(process.cwd(), SCRAPING_CONFIG.debug.htmlDumpDir)
    await mkdir(dumpDir, { recursive: true })

    const filePath = join(dumpDir, filename)

    // Get the HTML content
    const html = options?.includeOuterHtml
      ? await page.content()
      : await page
          .locator('body')
          .innerHTML()
          .catch(() => page.content())

    // Add metadata header
    const metadata = `<!--
  URL: ${page.url()}
  Label: ${label}
  Timestamp: ${new Date().toISOString()}
  Title: ${await page.title().catch(() => 'N/A')}
-->
`

    await writeFile(filePath, metadata + html, 'utf-8')
    console.log(`📄 HTML dumped to: ${filePath}`)

    return filePath
  } catch (error) {
    console.log('⚠️ Failed to dump HTML:', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

/**
 * Quick extraction helper with fast timeout.
 * Returns null instead of throwing on timeout.
 */
export async function quickText(
  page: Page,
  selector: string,
  timeoutMs = SCRAPING_CONFIG.extraction.textContentTimeoutMs,
): Promise<string | null> {
  try {
    const element = page.locator(selector).first()
    const isVisible = await element.isVisible({ timeout: SCRAPING_CONFIG.extraction.visibilityTimeoutMs }).catch(() => false)
    if (!isVisible) return null
    return await element.textContent({ timeout: timeoutMs }).catch(() => null)
  } catch {
    return null
  }
}

/**
 * Quick attribute extraction helper with fast timeout.
 * Returns null instead of throwing on timeout.
 */
export async function quickAttr(
  page: Page,
  selector: string,
  attribute: string,
  timeoutMs = SCRAPING_CONFIG.extraction.attributeTimeoutMs,
): Promise<string | null> {
  try {
    const element = page.locator(selector).first()
    const isVisible = await element.isVisible({ timeout: SCRAPING_CONFIG.extraction.visibilityTimeoutMs }).catch(() => false)
    if (!isVisible) return null
    return await element.getAttribute(attribute, { timeout: timeoutMs }).catch(() => null)
  } catch {
    return null
  }
}
