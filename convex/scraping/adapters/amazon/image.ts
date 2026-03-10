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

/**
 * Transform Amazon image URL to medium resolution (522px height).
 * Good for grids and list views where full resolution is overkill.
 */
export function toMediumResAmazonImageUrl(url: string): string {
  if (!url) return url

  // Check if it's an Amazon image URL
  if (!url.includes('media-amazon.com/images')) return url

  // Replace any size suffix with _SY522_ for medium resolution
  return url.replace(AMAZON_IMAGE_SIZE_PATTERN, '._SY522_.')
}

/**
 * Transform Amazon image URL to thumbnail resolution (100px height).
 * Good for small thumbnails in grids and compact lists.
 */
export function toThumbResAmazonImageUrl(url: string): string {
  if (!url) return url

  // Check if it's an Amazon image URL
  if (!url.includes('media-amazon.com/images')) return url

  // Replace any size suffix with _SY100_ for thumbnail resolution
  return url.replace(AMAZON_IMAGE_SIZE_PATTERN, '._SY100_.')
}

export function toOriginalAmazonImageUrl(url: string): string {
  if (!url) return url

  // Check if it's an Amazon image URL
  if (!url.includes('media-amazon.com/images')) return url

  // Remove size suffix entirely to get original
  const originalUrl = url.replace(AMAZON_IMAGE_SIZE_PATTERN, '.')

  return originalUrl
}

/**
 * Transform Amazon image URL to a specific longest-side resolution.
 * Used for author images (36px, 150px, 400px).
 */
export function toAmazonImageLongestSide(url: string, px: number): string {
  if (!url || !url.includes('media-amazon.com/images')) return url

  const sized = url.replace(AMAZON_IMAGE_SIZE_PATTERN, `._SL${px}_.`)
  if (sized !== url) return sized

  // Some Amazon image URLs have no size suffix at all. In that case, insert one
  // before the file extension: .../images/I/FILE.jpg -> .../images/I/FILE._SL400_.jpg
  const extensionMatch = url.match(/(\/images\/I\/[^?#]+?)(\.(?:jpe?g|png|webp|gif))([?#].*)?$/i)
  if (!extensionMatch) return url

  const base = extensionMatch[1]
  const ext = extensionMatch[2]
  const suffix = extensionMatch[3] ?? ''

  return `${base}._SL${px}_${ext}${suffix}`
}
