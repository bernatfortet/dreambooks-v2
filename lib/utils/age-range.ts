/**
 * Age range parsing and formatting utilities.
 *
 * Storage format: { min: number, max: number }
 * Display format: "4-8 years"
 */

export type AgeRange = {
  min: number
  max: number
}

/**
 * Parse an age range string into numeric min/max values.
 * Handles various formats from Amazon and other sources:
 * - "4 - 8 years"
 * - "4-8"
 * - "4 to 8 years"
 * - "4 years and up"
 * - "Ages 4-8"
 * - "4+"
 *
 * @returns AgeRange object or null if parsing fails
 */
export function parseAgeRange(raw: string | null | undefined): AgeRange | null {
  if (!raw || typeof raw !== 'string') return null

  const text = raw.toLowerCase().trim()

  // Pattern 1: "X - Y years" or "X-Y years" or "X to Y years"
  // Examples: "4 - 8 years", "4-8", "4 to 8 years", "ages 4-8"
  const rangeMatch = text.match(/(\d+)\s*[-–—to]+\s*(\d+)/)
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10)
    const max = parseInt(rangeMatch[2], 10)
    if (!isNaN(min) && !isNaN(max) && min <= max && min >= 0 && max <= 18) {
      return { min, max }
    }
  }

  // Pattern 2: "X years and up" or "X+" or "X and up"
  // Examples: "4 years and up", "4+", "8 and up"
  const andUpMatch = text.match(/(\d+)\s*(?:\+|years?\s+and\s+up|and\s+up)/)
  if (andUpMatch) {
    const min = parseInt(andUpMatch[1], 10)
    if (!isNaN(min) && min >= 0 && min <= 18) {
      // "and up" typically means through young adult (18)
      return { min, max: 18 }
    }
  }

  // Pattern 3: Single age "X years" or just "X"
  // Examples: "4 years", "4"
  const singleMatch = text.match(/^(?:ages?\s+)?(\d+)(?:\s+years?)?$/)
  if (singleMatch) {
    const age = parseInt(singleMatch[1], 10)
    if (!isNaN(age) && age >= 0 && age <= 18) {
      // Single age means that specific age only
      return { min: age, max: age }
    }
  }

  return null
}

/**
 * Format an age range for display.
 *
 * @returns Display string like "4-8 years" or null if invalid
 */
export function formatAgeRange(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min == null || max == null) return null
  if (min < 0 || max < 0 || min > max) return null

  if (min === max) {
    return `${min} years`
  }

  if (max === 18) {
    return `${min}+ years`
  }

  return `${min}-${max} years`
}

/**
 * Generate filter-friendly age range label for UI.
 * Groups ages into common brackets for filtering.
 *
 * @returns Label like "0-3", "4-8", "9-12", "13+"
 */
export function getAgeRangeBucket(min: number, max: number): string {
  // Determine which bucket(s) this range overlaps with
  // For simplicity, categorize by the range's midpoint
  const midpoint = (min + max) / 2

  if (midpoint <= 3) return '0-3'
  if (midpoint <= 8) return '4-8'
  if (midpoint <= 12) return '9-12'
  return '13+'
}

/**
 * Standard age range buckets for filtering UI.
 */
export const AGE_RANGE_BUCKETS = [
  { label: '0-3 years', min: 0, max: 3 },
  { label: '4-8 years', min: 4, max: 8 },
  { label: '9-12 years', min: 9, max: 12 },
  { label: '13+ years', min: 13, max: 18 },
] as const

/**
 * Check if a book's age range overlaps with a filter bucket.
 *
 * A book with range [4,8] overlaps with bucket [0,3] if 4 <= 3 (no)
 * A book with range [4,8] overlaps with bucket [4,8] if 4 <= 8 AND 8 >= 4 (yes)
 * A book with range [2,6] overlaps with bucket [4,8] if 2 <= 8 AND 6 >= 4 (yes)
 */
export function ageRangeOverlaps(
  bookMin: number,
  bookMax: number,
  bucketMin: number,
  bucketMax: number
): boolean {
  return bookMin <= bucketMax && bookMax >= bucketMin
}
