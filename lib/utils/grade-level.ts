/**
 * Grade level parsing and formatting utilities.
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

/**
 * Format a grade level for display.
 *
 * @returns Display string like "K-3" or "3-5" or null if invalid
 */
export function formatGradeLevel(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null || max == null) return null
  if (min < -1 || max < -1 || min > 12 || max > 12 || min > max) return null

  const formatGrade = (grade: number): string => {
    if (grade === -1) return 'Pre-K'
    if (grade === 0) return 'K'
    return grade.toString()
  }

  if (min === max) {
    return formatGrade(min)
  }

  return `${formatGrade(min)}-${formatGrade(max)}`
}

/**
 * Standard grade level buckets for filtering UI.
 */
export const GRADE_LEVEL_BUCKETS = [
  { id: 'prek', label: 'Pre-K', min: -1, max: -1 },
  { id: 'k-2', label: 'K-2', min: 0, max: 2 },
  { id: '3-5', label: '3-5', min: 3, max: 5 },
  { id: '6-8', label: '6-8', min: 6, max: 8 },
  { id: '9-12', label: '9-12', min: 9, max: 12 },
] as const

/**
 * Check if a book's grade level overlaps with a filter bucket.
 *
 * A book with range [3,7] overlaps with bucket [0,2] if 3 <= 2 (no)
 * A book with range [3,7] overlaps with bucket [3,5] if 3 <= 5 AND 7 >= 3 (yes)
 * A book with range [1,4] overlaps with bucket [3,5] if 1 <= 5 AND 4 >= 3 (yes)
 */
export function gradeLevelOverlaps(bookMin: number, bookMax: number, bucketMin: number, bucketMax: number): boolean {
  return bookMin <= bucketMax && bookMax >= bucketMin
}
