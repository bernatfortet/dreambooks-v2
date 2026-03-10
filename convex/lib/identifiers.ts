/**
 * Shared identifier normalization utilities.
 */

/**
 * Normalize an identifier value for consistent storage and lookup.
 * - ASIN: uppercase
 * - ISBN: strip hyphens, keep digits only
 */
export function normalizeIdentifier(type: string, value: string): string {
  if (type === 'asin') {
    return value.toUpperCase()
  }

  // ISBN: strip hyphens and spaces
  return value.replace(/[-\s]/g, '')
}
