import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Parse an age range string into numeric min/max values.
 * Duplicated here since Convex can't import from lib/ at runtime.
 */
function parseAgeRange(raw: string | null | undefined): { min: number; max: number } | null {
  if (!raw || typeof raw !== 'string') return null

  const text = raw.toLowerCase().trim()

  // Pattern 1: "X - Y years" or "X-Y years" or "X to Y years"
  const rangeMatch = text.match(/(\d+)\s*[-–—to]+\s*(\d+)/)
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10)
    const max = parseInt(rangeMatch[2], 10)
    if (!isNaN(min) && !isNaN(max) && min <= max && min >= 0 && max <= 18) {
      return { min, max }
    }
  }

  // Pattern 2: "X years and up" or "X+" or "X and up"
  const andUpMatch = text.match(/(\d+)\s*(?:\+|years?\s+and\s+up|and\s+up)/)
  if (andUpMatch) {
    const min = parseInt(andUpMatch[1], 10)
    if (!isNaN(min) && min >= 0 && min <= 18) {
      return { min, max: 18 }
    }
  }

  // Pattern 3: Single age "X years" or just "X"
  const singleMatch = text.match(/^(?:ages?\s+)?(\d+)(?:\s+years?)?$/)
  if (singleMatch) {
    const age = parseInt(singleMatch[1], 10)
    if (!isNaN(age) && age >= 0 && age <= 18) {
      return { min: age, max: age }
    }
  }

  return null
}

/**
 * Get books that need age range migration.
 * Returns books with ageRange string but missing ageRangeMin/ageRangeMax.
 */
export const getBooksNeedingMigration = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (context, args) => {
    const limit = args.limit ?? 100
    const books = await context.db.query('books').collect()

    // Filter to books with ageRange string but no numeric fields
    const needsMigration = books.filter(
      (book) => book.ageRange && (book.ageRangeMin === undefined || book.ageRangeMax === undefined)
    )

    return {
      total: needsMigration.length,
      batch: needsMigration.slice(0, limit).map((book) => ({
        _id: book._id,
        title: book.title,
        ageRange: book.ageRange,
        ageRangeMin: book.ageRangeMin,
        ageRangeMax: book.ageRangeMax,
      })),
    }
  },
})

/**
 * Migrate a batch of books to use numeric age range fields.
 * Parses the ageRange string and sets ageRangeMin/ageRangeMax.
 */
export const migrateAgeRangeBatch = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (context, args) => {
    const dryRun = args.dryRun ?? false
    const books = await context.db.query('books').collect()

    // Filter to books with ageRange string but no numeric fields
    const needsMigration = books.filter(
      (book) => book.ageRange && (book.ageRangeMin === undefined || book.ageRangeMax === undefined)
    )

    const results = {
      total: needsMigration.length,
      migrated: 0,
      skipped: 0,
      failed: [] as Array<{ title: string; ageRange: string; error: string }>,
    }

    for (const book of needsMigration) {
      const parsed = parseAgeRange(book.ageRange)

      if (parsed) {
        if (!dryRun) {
          await context.db.patch(book._id, {
            ageRangeMin: parsed.min,
            ageRangeMax: parsed.max,
          })
        }
        results.migrated++
      } else {
        results.failed.push({
          title: book.title,
          ageRange: book.ageRange || '',
          error: 'Could not parse age range',
        })
        results.skipped++
      }
    }

    return results
  },
})

/**
 * Get summary of age range data in the database.
 */
export const getAgeRangeSummary = internalQuery({
  handler: async (context) => {
    const books = await context.db.query('books').collect()

    const withAgeRangeString = books.filter((book) => book.ageRange)
    const withNumericFields = books.filter((book) => book.ageRangeMin !== undefined && book.ageRangeMax !== undefined)
    const needsMigration = books.filter(
      (book) => book.ageRange && (book.ageRangeMin === undefined || book.ageRangeMax === undefined)
    )

    // Get unique age range strings
    const uniqueStrings = [...new Set(withAgeRangeString.map((b) => b.ageRange))]

    // Sample of unparseable strings
    const unparseableSamples = uniqueStrings
      .filter((str) => str && !parseAgeRange(str))
      .slice(0, 10)

    return {
      totalBooks: books.length,
      withAgeRangeString: withAgeRangeString.length,
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
 * Public query to get age range migration summary.
 * Safe to expose publicly as it only reads data.
 */
export const summary = query({
  handler: async (context) => {
    const books = await context.db.query('books').collect()

    const withAgeRangeString = books.filter((book) => book.ageRange)
    const withNumericFields = books.filter((book) => book.ageRangeMin !== undefined && book.ageRangeMax !== undefined)
    const needsMigration = books.filter(
      (book) => book.ageRange && (book.ageRangeMin === undefined || book.ageRangeMax === undefined)
    )

    // Get unique age range strings
    const uniqueStrings = [...new Set(withAgeRangeString.map((b) => b.ageRange))]

    // Test parsing each unique string
    const parseResults = uniqueStrings.map((str) => ({
      original: str,
      parsed: parseAgeRange(str),
    }))

    const parseable = parseResults.filter((r) => r.parsed !== null)
    const unparseable = parseResults.filter((r) => r.parsed === null)

    return {
      totalBooks: books.length,
      withAgeRangeString: withAgeRangeString.length,
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
 * Public mutation to run age range migration.
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
        ageRange: v.string(),
        error: v.string(),
      })
    ),
  }),
  handler: async (context, args) => {
    const books = await context.db.query('books').collect()

    // Filter to books with ageRange string but no numeric fields
    const needsMigration = books.filter(
      (book) => book.ageRange && (book.ageRangeMin === undefined || book.ageRangeMax === undefined)
    )

    const results = {
      total: needsMigration.length,
      migrated: 0,
      skipped: 0,
      failed: [] as Array<{ title: string; ageRange: string; error: string }>,
    }

    for (const book of needsMigration) {
      const parsed = parseAgeRange(book.ageRange)

      if (parsed) {
        if (!args.dryRun) {
          await context.db.patch(book._id, {
            ageRangeMin: parsed.min,
            ageRangeMax: parsed.max,
          })
        }
        results.migrated++
      } else {
        results.failed.push({
          title: book.title,
          ageRange: book.ageRange || '',
          error: 'Could not parse age range',
        })
        results.skipped++
      }
    }

    return results
  },
})
