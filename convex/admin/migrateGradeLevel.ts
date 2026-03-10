import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Convert a grade level string to a numeric value.
 * Duplicated here since Convex can't import from lib/ at runtime.
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
 * Duplicated here since Convex can't import from lib/ at runtime.
 */
function parseGradeLevel(raw: string | null | undefined): { min: number; max: number } | null {
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
  const single = parseGradeString(text)
  if (single !== null && single >= -1 && single <= 12) {
    return { min: single, max: single }
  }

  return null
}

/**
 * Get books that need grade level migration.
 * Returns books with gradeLevel string but missing gradeLevelMin/gradeLevelMax.
 */
export const getBooksNeedingMigration = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (context, args) => {
    const limit = args.limit ?? 100
    const books = await context.db.query('books').collect()

    // Filter to books with gradeLevel string but no numeric fields
    const needsMigration = books.filter((book) => book.gradeLevel && (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined))

    return {
      total: needsMigration.length,
      batch: needsMigration.slice(0, limit).map((book) => ({
        _id: book._id,
        title: book.title,
        gradeLevel: book.gradeLevel,
        gradeLevelMin: book.gradeLevelMin,
        gradeLevelMax: book.gradeLevelMax,
      })),
    }
  },
})

/**
 * Migrate a batch of books to use numeric grade level fields.
 * Parses the gradeLevel string and sets gradeLevelMin/gradeLevelMax.
 */
export const migrateGradeLevelBatch = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (context, args) => {
    const dryRun = args.dryRun ?? false
    const books = await context.db.query('books').collect()

    // Filter to books with gradeLevel string but no numeric fields
    const needsMigration = books.filter((book) => book.gradeLevel && (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined))

    const results = {
      total: needsMigration.length,
      migrated: 0,
      skipped: 0,
      failed: [] as Array<{ title: string; gradeLevel: string; error: string }>,
    }

    for (const book of needsMigration) {
      const parsed = parseGradeLevel(book.gradeLevel)

      if (parsed) {
        if (!dryRun) {
          await context.db.patch(book._id, {
            gradeLevelMin: parsed.min,
            gradeLevelMax: parsed.max,
          })
        }
        results.migrated++
      } else {
        results.failed.push({
          title: book.title,
          gradeLevel: book.gradeLevel || '',
          error: 'Could not parse grade level',
        })
        results.skipped++
      }
    }

    return results
  },
})

/**
 * Get summary of grade level data in the database.
 */
export const getGradeLevelSummary = internalQuery({
  handler: async (context) => {
    const books = await context.db.query('books').collect()

    const withGradeLevelString = books.filter((book) => book.gradeLevel)
    const withNumericFields = books.filter((book) => book.gradeLevelMin !== undefined && book.gradeLevelMax !== undefined)
    const needsMigration = books.filter((book) => book.gradeLevel && (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined))

    // Get unique grade level strings
    const uniqueStrings = [...new Set(withGradeLevelString.map((b) => b.gradeLevel))]

    // Sample of unparseable strings
    const unparseableSamples = uniqueStrings.filter((str) => str && !parseGradeLevel(str)).slice(0, 10)

    return {
      totalBooks: books.length,
      withGradeLevelString: withGradeLevelString.length,
      withNumericFields: withNumericFields.length,
      needsMigration: needsMigration.length,
      uniqueStrings: uniqueStrings.length,
      unparseableSamples,
      sampleStrings: uniqueStrings.slice(0, 20),
    }
  },
})

// =====================
// PUBLIC VERSIONS (for CLI access)
// =====================

/**
 * Public query to get grade level migration summary.
 * Safe to expose publicly as it only reads data.
 */
export const summary = query({
  handler: async (context) => {
    const books = await context.db.query('books').collect()

    const withGradeLevelString = books.filter((book) => book.gradeLevel)
    const withNumericFields = books.filter((book) => book.gradeLevelMin !== undefined && book.gradeLevelMax !== undefined)
    const needsMigration = books.filter((book) => book.gradeLevel && (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined))

    // Get unique grade level strings
    const uniqueStrings = [...new Set(withGradeLevelString.map((b) => b.gradeLevel))]

    // Test parsing each unique string
    const parseResults = uniqueStrings.map((str) => ({
      original: str,
      parsed: parseGradeLevel(str),
    }))

    const parseable = parseResults.filter((r) => r.parsed !== null)
    const unparseable = parseResults.filter((r) => r.parsed === null)

    return {
      totalBooks: books.length,
      withGradeLevelString: withGradeLevelString.length,
      withNumericFields: withNumericFields.length,
      needsMigration: needsMigration.length,
      uniqueStrings: uniqueStrings.length,
      parseableCount: parseable.length,
      unparseableCount: unparseable.length,
      unparseableSamples: unparseable.slice(0, 10).map((r) => r.original),
      parseExamples: parseable.slice(0, 10).map((r) => ({
        original: r.original,
        min: r.parsed!.min,
        max: r.parsed!.max,
      })),
    }
  },
})

/**
 * Public mutation to run grade level migration.
 * Requires dryRun flag for safety.
 */
export const migrate = mutation({
  args: {
    dryRun: v.boolean(),
  },
  returns: v.object({
    total: v.number(),
    migrated: v.number(),
    skipped: v.number(),
    failed: v.array(
      v.object({
        title: v.string(),
        gradeLevel: v.string(),
        error: v.string(),
      }),
    ),
  }),
  handler: async (context, args) => {
    const books = await context.db.query('books').collect()

    // Filter to books with gradeLevel string but no numeric fields
    const needsMigration = books.filter((book) => book.gradeLevel && (book.gradeLevelMin === undefined || book.gradeLevelMax === undefined))

    const results = {
      total: needsMigration.length,
      migrated: 0,
      skipped: 0,
      failed: [] as Array<{ title: string; gradeLevel: string; error: string }>,
    }

    for (const book of needsMigration) {
      const parsed = parseGradeLevel(book.gradeLevel)

      if (parsed) {
        if (!args.dryRun) {
          await context.db.patch(book._id, {
            gradeLevelMin: parsed.min,
            gradeLevelMax: parsed.max,
          })
        }
        results.migrated++
      } else {
        results.failed.push({
          title: book.title,
          gradeLevel: book.gradeLevel || '',
          error: 'Could not parse grade level',
        })
        results.skipped++
      }
    }

    return results
  },
})
