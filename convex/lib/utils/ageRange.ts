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
