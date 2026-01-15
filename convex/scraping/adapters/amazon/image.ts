/**
 * Transform Amazon product image URLs to get highest resolution.
 *
 * Amazon image URLs follow patterns like:
 * - https://m.media-amazon.com/images/I/81aOXcpkNQL._SY522_.jpg (522px height)
 * - https://m.media-amazon.com/images/I/81aOXcpkNQL._SL1500_.jpg (1500px)
 * - https://m.media-amazon.com/images/I/81aOXcpkNQL._AC_UL320_.jpg (320px)
 * - https://m.media-amazon.com/images/I/81aOXcpkNQL._AC_SX679_.jpg (679px width)
 * - https://m.media-amazon.com/images/I/81aOXcpkNQL.jpg (original)
 *
 * Common suffixes:
 * - _SY###_ = Scale to height
 * - _SX###_ = Scale to width
 * - _SL###_ = Scale (longest side)
 * - _AC_UL###_ = Another scaling pattern
 * - _AC_SX###_ = Another pattern
 */

// Matches the size suffix portion: ._SY522_. or ._AC_UL320_. etc
// Pattern: dot, underscore, letters/underscores/numbers, underscore, dot
const AMAZON_IMAGE_SIZE_PATTERN = /\.(_[A-Z][A-Z0-9_]*_)\./

export function toHighResAmazonImageUrl(url: string): string {
  if (!url) return url

  // Check if it's an Amazon image URL
  if (!url.includes('media-amazon.com/images')) return url

  // Replace any size suffix with _SL1500_ for max resolution
  const highResUrl = url.replace(AMAZON_IMAGE_SIZE_PATTERN, '._SL1500_.')

  console.log('🖼️ Amazon URL transform', { original: url, highRes: highResUrl, changed: url !== highResUrl })

  return highResUrl
}

export function toOriginalAmazonImageUrl(url: string): string {
  if (!url) return url

  // Check if it's an Amazon image URL
  if (!url.includes('media-amazon.com/images')) return url

  // Remove size suffix entirely to get original
  const originalUrl = url.replace(AMAZON_IMAGE_SIZE_PATTERN, '.')

  return originalUrl
}
