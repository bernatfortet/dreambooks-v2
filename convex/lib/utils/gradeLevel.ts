/**
 * Grade level parsing and formatting utilities.
 * Duplicated here since Convex can't import from lib/ at runtime.
 *
 * Storage format: { min: number, max: number }
 * Display format: "K-3" or "3-5"
 *
 * Grade level mapping:
 * - Pre-K / Preschool / PreKindergarten = -1
 * - Kindergarten / K = 0
 * - 1st - 12th grade = 1-12
 */

export type GradeLevel = {
  min: number
  max: number
}

/**
 * Convert a grade level string to a numeric value.
 * - Pre-K / Preschool / PreKindergarten → -1
 * - Kindergarten / K → 0
 * - 1st - 12th grade → 1-12
 */
function parseGradeString(gradeStr: string): number | null {
  const text = gradeStr.toLowerCase().trim()

  // Pre-K variations
  if (text.includes('pre-k') || text.includes('prek') || text.includes('preschool') || text.includes('pre-kindergarten')) {
    return -1
  }

  // Kindergarten variations
  if (text === 'k' || text === 'kindergarten' || text.includes('kindergarten')) {
    return 0
  }

  // Numeric grades (1-12)
  const numericMatch = text.match(/(\d+)/)
  if (numericMatch) {
    const grade = parseInt(numericMatch[1], 10)
    if (!isNaN(grade) && grade >= 1 && grade <= 12) {
      return grade
    }
  }

  return null
}

/**
 * Parse a grade level string into numeric min/max values.
 * Handles various formats from Amazon and other sources:
 * - "3 - 7"
 * - "Preschool - 3"
 * - "Kindergarten - 2"
 * - "K - 3"
 * - "K"
 * - "Pre-K"
 * - "1 - 3"
 *
 * @returns GradeLevel object or null if parsing fails
 */
export function parseGradeLevel(raw: string | null | undefined): GradeLevel | null {
  if (!raw || typeof raw !== 'string') return null

  const text = raw.trim()

  // Pattern 1: "X and up" format
  // Examples: "Preschool and up", "3rd grade and up", "K and up"
  const andUpMatch = text.match(/^(.+?)\s+and\s+up$/i)
  if (andUpMatch) {
    const min = parseGradeString(andUpMatch[1].trim())
    if (min !== null && min >= -1 && min <= 12) {
      return { min, max: 12 } // "and up" means through 12th grade
    }
  }

  // Pattern 2: Range format "X - Y" or "X-Y" or "X to Y"
  // Examples: "3 - 7", "Preschool - 3", "K - 3", "Kindergarten - 2"
  const rangeMatch = text.match(/^(.+?)\s*(?:[-–—]|to)\s+(.+)$/i)
  if (rangeMatch) {
    const minStr = rangeMatch[1].trim()
    const maxStr = rangeMatch[2].trim()

    const min = parseGradeString(minStr)
    const max = parseGradeString(maxStr)

    if (min !== null && max !== null && min <= max && min >= -1 && max <= 12) {
      return { min, max }
    }
  }

  // Pattern 3: Single grade level
  // Examples: "K", "Pre-K", "3", "Kindergarten"
  const single = parseGradeString(text)
  if (single !== null && single >= -1 && single <= 12) {
    return { min: single, max: single }
  }

  return null
}
