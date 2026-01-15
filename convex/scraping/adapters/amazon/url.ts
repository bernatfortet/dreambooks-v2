/**
 * Amazon URL normalization and ID extraction utilities.
 *
 * Used for deduplication of series and book discoveries.
 */

/**
 * Extract ASIN from Amazon product URL.
 *
 * Patterns:
 * - /dp/XXXXXXXXXX
 * - /gp/product/XXXXXXXXXX
 * - /gp/aw/d/XXXXXXXXXX (mobile)
 */
export function extractAsin(url: string): string | null {
  if (!url) return null

  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1].toUpperCase()
  }

  return null
}

/**
 * Extract series ID from Amazon series URL.
 *
 * Patterns:
 * - ?series=XXXXXXXXXX
 * - /gp/series/XXXXXXXXXX
 * - /kindle-dbs/series?...&asin=XXXXXXXXXX
 */
export function extractSeriesId(url: string): string | null {
  if (!url) return null

  const patterns = [
    /[?&]series=([A-Z0-9]+)/i,
    /\/gp\/series\/([A-Z0-9]+)/i,
    /\/kindle-dbs\/series.*[?&]asin=([A-Z0-9]+)/i,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1].toUpperCase()
  }

  return null
}

/**
 * Normalize Amazon URL for deduplication.
 *
 * - Strips query parameters (except essential ones)
 * - Normalizes to amazon.com (drops regional variants)
 * - Extracts canonical path
 */
export function normalizeAmazonUrl(url: string): string {
  if (!url) return url

  try {
    const parsed = new URL(url)

    // Normalize host to amazon.com
    const normalizedHost = 'amazon.com'

    // Extract the canonical path
    let path = parsed.pathname

    // For product pages, normalize to /dp/ASIN format
    const asin = extractAsin(url)
    if (asin) {
      path = `/dp/${asin}`
    }

    // For series pages, normalize to /gp/series/ID format
    const seriesId = extractSeriesId(url)
    if (seriesId && !asin) {
      path = `/gp/series/${seriesId}`
    }

    const normalized = `https://${normalizedHost}${path}`

    return normalized
  } catch {
    // If URL parsing fails, return as-is
    return url
  }
}

/**
 * Check if URL is an Amazon URL.
 */
export function isAmazonUrl(url: string): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)

    return parsed.hostname.includes('amazon.')
  } catch {
    return false
  }
}
