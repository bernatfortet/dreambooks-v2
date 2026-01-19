/**
 * Amazon URL normalization and ID extraction utilities.
 *
 * Single source of truth for Amazon URL handling across the codebase.
 * Used for deduplication of series and book discoveries.
 *
 * IMPORTANT: We preserve Amazon slugs in URLs because:
 * 1. They're useful for our own SEO-friendly URLs
 * 2. They make URLs human-readable
 * 3. Amazon URLs with slugs still work (slug is ignored, only ID matters)
 */

/**
 * Extract ASIN from Amazon product URL.
 *
 * Patterns supported:
 * - /dp/XXXXXXXXXX
 * - /gp/product/XXXXXXXXXX
 * - /gp/aw/d/XXXXXXXXXX (mobile)
 * - /series/XXXXXXXXXX
 * - ?asin=XXXXXXXXXX (query param)
 */
export function extractAsin(url: string): string | null {
  if (!url) return null

  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
    /\/series\/([A-Z0-9]{10})/i,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1].toUpperCase()
  }

  // Try query parameter
  try {
    const urlObj = new URL(url)
    const asinParam = urlObj.searchParams.get('asin')
    if (asinParam && /^[A-Z0-9]{10}$/i.test(asinParam)) {
      return asinParam.toUpperCase()
    }
  } catch {
    // Invalid URL, continue
  }

  return null
}

// Alias for backward compatibility
export const extractAsinFromUrl = extractAsin

/**
 * Extract author ID from Amazon author URL.
 *
 * Patterns:
 * - /e/XXXXXXXXXX (preferred format with slug)
 * - /author/XXXXXXXXXX (alternative format)
 * - /stores/author/XXXXXXXXXX
 */
export function extractAuthorId(url: string): string | null {
  if (!url) return null

  const patterns = [
    /\/e\/([A-Z0-9]+)/i,
    /\/author\/([A-Z0-9]+)/i,
    /\/stores\/author\/([A-Z0-9]+)/i,
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
 * Extract the slug from an Amazon URL.
 *
 * Examples:
 * - /Arnold-Lobel/e/B000APNG74 → "Arnold-Lobel"
 * - /Frog-Toad-Are-Friends/dp/0064440206 → "Frog-Toad-Are-Friends"
 * - /gp/series/Frog-and-Toad/B09HCDXVS2 → "Frog-and-Toad"
 * - /dp/0064440206 → null (no slug)
 */
export function extractAmazonSlug(url: string): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname

    // Pattern: /Slug-Name/e/ID (author)
    const authorMatch = pathname.match(/^\/([^/]+)\/e\/[A-Z0-9]+/i)
    if (authorMatch && authorMatch[1] !== 'stores') {
      return authorMatch[1]
    }

    // Pattern: /Slug-Name/dp/ASIN (book)
    const bookMatch = pathname.match(/^\/([^/]+)\/dp\/[A-Z0-9]+/i)
    if (bookMatch && bookMatch[1] !== 'gp') {
      return bookMatch[1]
    }

    // Pattern: /gp/series/Slug-Name/ID (series - slug after /series/)
    const seriesMatch = pathname.match(/\/gp\/series\/([^/]+)\/[A-Z0-9]+/i)
    if (seriesMatch) {
      return seriesMatch[1]
    }

    return null
  } catch {
    return null
  }
}

/**
 * Normalize Amazon URL for deduplication.
 *
 * Preserves the path structure (including slugs) but:
 * - Strips query parameters (except essential ones)
 * - Normalizes to www.amazon.com
 * - Cleans up any ref/tracking parameters from the path
 */
export function normalizeAmazonUrl(url: string): string {
  if (!url) return url

  try {
    const parsed = new URL(url)
    let pathname = parsed.pathname

    // Remove trailing slashes
    pathname = pathname.replace(/\/+$/, '')

    // Remove ref parameters from path (e.g., /ref=xxx at the end)
    pathname = pathname.replace(/\/ref=[^/]*$/, '')

    // Normalize to www.amazon.com
    return `https://www.amazon.com${pathname}`
  } catch {
    // If URL parsing fails, return as-is
    return url
  }
}

/**
 * Build a canonical author URL preserving the slug if available.
 *
 * @param authorId - The Amazon author ID (e.g., "B000APNG74")
 * @param slug - Optional slug (e.g., "Arnold-Lobel")
 * @returns URL like /Arnold-Lobel/e/B000APNG74 or /e/B000APNG74
 */
export function buildAuthorUrl(authorId: string, slug?: string | null): string {
  if (slug) {
    return `https://www.amazon.com/${slug}/e/${authorId}`
  }
  return `https://www.amazon.com/e/${authorId}`
}

/**
 * Build a canonical book URL preserving the slug if available.
 *
 * @param asin - The Amazon ASIN
 * @param slug - Optional slug (e.g., "Frog-Toad-Are-Friends")
 * @returns URL like /Frog-Toad-Are-Friends/dp/0064440206 or /dp/0064440206
 */
export function buildBookUrl(asin: string, slug?: string | null): string {
  if (slug) {
    return `https://www.amazon.com/${slug}/dp/${asin}`
  }
  return `https://www.amazon.com/dp/${asin}`
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
