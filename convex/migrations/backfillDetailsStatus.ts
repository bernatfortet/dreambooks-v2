/**
 * Migration: Backfill detailsStatus for existing books
 *
 * This migration:
 * 1. Sets detailsStatus to 'complete' for books that have full data
 * 2. Sets detailsStatus to 'basic' for books with minimal data
 *
 * After running this migration:
 * - Remove v.optional() from detailsStatus in schema.ts
 * - Remove the deprecated scrapeStatus field from schema.ts
 *
 * Run with: npx convex run migrations/backfillDetailsStatus:run
 */

import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

export const run = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    skipped: v.number(),
  }),
  handler: async (context, args) => {
    const dryRun = args.dryRun ?? true
    console.log(`🔄 Running detailsStatus backfill migration (dryRun: ${dryRun})`)

    const books = await context.db.query('books').collect()

    let updated = 0
    let skipped = 0

    for (const book of books) {
      // Skip if already has detailsStatus
      if (book.detailsStatus !== undefined) {
        skipped++
        continue
      }

      // Determine status based on data completeness
      const hasFullDetails = Boolean(
        book.description &&
        book.isbn13 &&
        book.publisher
      )

      const newStatus = hasFullDetails ? 'complete' : 'basic'

      if (!dryRun) {
        await context.db.patch(book._id, {
          detailsStatus: newStatus,
        })
      }

      console.log(`  ${dryRun ? '[DRY]' : ''} ${book.title}: ${newStatus}`)
      updated++
    }

    console.log(`✅ Migration complete: ${updated} updated, ${skipped} skipped`)

    return {
      processed: books.length,
      updated,
      skipped,
    }
  },
})
