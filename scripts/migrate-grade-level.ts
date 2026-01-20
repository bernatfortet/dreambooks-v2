#!/usr/bin/env bunx tsx

/**
 * Migration script to standardize grade level data.
 *
 * Converts gradeLevel strings (e.g., "3 - 7", "Preschool - 3") to numeric gradeLevelMin/gradeLevelMax fields.
 *
 * Usage:
 *   bunx tsx scripts/migrate-grade-level.ts            # Show summary
 *   bunx tsx scripts/migrate-grade-level.ts --dry-run  # Preview changes
 *   bunx tsx scripts/migrate-grade-level.ts --migrate  # Apply changes
 */

import * as dotenv from 'dotenv'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

dotenv.config({ path: '.env.local' })
dotenv.config()

async function main() {
  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is not set')
  }

  const client = new ConvexHttpClient(convexUrl)

  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const shouldMigrate = args.includes('--migrate')

  console.log('═'.repeat(60))
  console.log('📊 GRADE LEVEL MIGRATION')
  console.log('═'.repeat(60))
  console.log('')

  // Get detailed summary
  console.log('📈 Fetching migration summary...\n')

  const summary = await client.query(api.admin.migrateGradeLevel.summary)

  console.log(`   Total books: ${summary.totalBooks}`)
  console.log(`   With grade level string: ${summary.withGradeLevelString}`)
  console.log(`   With numeric fields: ${summary.withNumericFields}`)
  console.log(`   Needs migration: ${summary.needsMigration}`)
  console.log('')
  console.log(`   Unique grade level strings: ${summary.uniqueStrings}`)
  console.log(`   Parseable: ${summary.parseableCount}`)
  console.log(`   Unparseable: ${summary.unparseableCount}`)
  console.log('')

  if (summary.parseExamples.length > 0) {
    console.log('   Parse examples:')
    summary.parseExamples.forEach((ex) => {
      console.log(`     "${ex.original}" → min: ${ex.min}, max: ${ex.max}`)
    })
    console.log('')
  }

  if (summary.unparseableSamples.length > 0) {
    console.log('   ⚠️  Unparseable samples (will be skipped):')
    summary.unparseableSamples.forEach((s) => {
      console.log(`     - "${s}"`)
    })
    console.log('')
  }

  if (!shouldMigrate && !isDryRun) {
    console.log('═'.repeat(60))
    console.log('')
    console.log('Options:')
    console.log('  --dry-run   Preview which books would be migrated')
    console.log('  --migrate   Apply the migration')
    console.log('')
    console.log('Example:')
    console.log('  bunx tsx scripts/migrate-grade-level.ts --dry-run')
    console.log('  bunx tsx scripts/migrate-grade-level.ts --migrate')
    console.log('')
    return
  }

  console.log('═'.repeat(60))
  console.log('')

  if (isDryRun) {
    console.log('🔍 Running dry run...\n')
    const result = await client.mutation(api.admin.migrateGradeLevel.migrate, { dryRun: true })
    console.log(`   Would migrate: ${result.migrated} books`)
    console.log(`   Would skip: ${result.skipped} books`)

    if (result.failed.length > 0) {
      console.log('')
      console.log('   Failed to parse:')
      result.failed.forEach((f) => {
        console.log(`     - "${f.title}": "${f.gradeLevel}"`)
      })
    }
  } else if (shouldMigrate) {
    console.log('🚀 Running migration...\n')
    const result = await client.mutation(api.admin.migrateGradeLevel.migrate, { dryRun: false })
    console.log(`   ✅ Migrated: ${result.migrated} books`)
    console.log(`   ⚠️  Skipped: ${result.skipped} books`)

    if (result.failed.length > 0) {
      console.log('')
      console.log('   Failed to parse:')
      result.failed.forEach((f) => {
        console.log(`     - "${f.title}": "${f.gradeLevel}"`)
      })
    }
  }

  console.log('')
  console.log('═'.repeat(60))
}

main().catch((error) => {
  console.error('🚨 Migration failed:', error)
  process.exit(1)
})
