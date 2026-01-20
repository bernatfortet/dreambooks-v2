#!/usr/bin/env bun

/**
 * Backfill slugs for existing entities in the database.
 * This script generates slugs for all books, series, authors, and awards that don't have slugs yet.
 */

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convexUrl = process.env.CONVEX_URL
if (!convexUrl) {
  throw new Error('CONVEX_URL environment variable is not set')
}

const client = new ConvexHttpClient(convexUrl)

async function backfillSlugs() {
  console.log('🔄 Starting slug backfill migration...\n')

  // Get all entities without slugs
  const books = await client.query(api.books.queries.list)
  const series = await client.query(api.series.queries.list)
  const authors = await client.query(api.authors.queries.list)
  const awards = await client.query(api.awards.queries.list)

  const booksWithoutSlugs = books.filter((book) => !book.slug)
  const seriesWithoutSlugs = series.filter((s) => !s.slug)
  const authorsWithoutSlugs = authors.filter((a) => !a.slug)
  // Awards don't have slugs in the schema
  const awardsWithoutSlugs: typeof awards = []

  console.log(`📚 Books: ${booksWithoutSlugs.length} without slugs (${books.length} total)`)
  console.log(`📖 Series: ${seriesWithoutSlugs.length} without slugs (${series.length} total)`)
  console.log(`👤 Authors: ${authorsWithoutSlugs.length} without slugs (${authors.length} total)`)
  console.log(`🏆 Awards: ${awardsWithoutSlugs.length} without slugs (${awards.length} total)\n`)

  let totalProcessed = 0
  let totalErrors = 0

  // Backfill books
  if (booksWithoutSlugs.length > 0) {
    console.log(`📚 Backfilling ${booksWithoutSlugs.length} books...`)
    for (const book of booksWithoutSlugs) {
      try {
        await client.mutation(api.books.mutations.updateSlug, {
          bookId: book._id,
          title: book.title,
        })
        totalProcessed++
        if (totalProcessed % 10 === 0) {
          console.log(`  ✅ Processed ${totalProcessed} entities...`)
        }
      } catch (error) {
        console.error(`  ❌ Error processing book ${book._id}:`, error)
        totalErrors++
      }
    }
    console.log(`✅ Books complete\n`)
  }

  // Backfill series
  if (seriesWithoutSlugs.length > 0) {
    console.log(`📖 Backfilling ${seriesWithoutSlugs.length} series...`)
    for (const s of seriesWithoutSlugs) {
      try {
        await client.mutation(api.series.mutations.updateSlug, {
          seriesId: s._id,
          name: s.name,
        })
        totalProcessed++
        if (totalProcessed % 10 === 0) {
          console.log(`  ✅ Processed ${totalProcessed} entities...`)
        }
      } catch (error) {
        console.error(`  ❌ Error processing series ${s._id}:`, error)
        totalErrors++
      }
    }
    console.log(`✅ Series complete\n`)
  }

  // Backfill authors
  if (authorsWithoutSlugs.length > 0) {
    console.log(`👤 Backfilling ${authorsWithoutSlugs.length} authors...`)
    for (const author of authorsWithoutSlugs) {
      try {
        await client.mutation(api.authors.mutations.updateSlug, {
          authorId: author._id,
          name: author.name,
        })
        totalProcessed++
        if (totalProcessed % 10 === 0) {
          console.log(`  ✅ Processed ${totalProcessed} entities...`)
        }
      } catch (error) {
        console.error(`  ❌ Error processing author ${author._id}:`, error)
        totalErrors++
      }
    }
    console.log(`✅ Authors complete\n`)
  }

  // Backfill awards
  if (awardsWithoutSlugs.length > 0) {
    console.log(`🏆 Backfilling ${awardsWithoutSlugs.length} awards...`)
    for (const award of awardsWithoutSlugs) {
      try {
        await client.mutation(api.awards.mutations.updateSlug, {
          awardId: award._id,
          name: award.name,
        })
        totalProcessed++
        if (totalProcessed % 10 === 0) {
          console.log(`  ✅ Processed ${totalProcessed} entities...`)
        }
      } catch (error) {
        console.error(`  ❌ Error processing award ${award._id}:`, error)
        totalErrors++
      }
    }
    console.log(`✅ Awards complete\n`)
  }

  console.log(`\n✨ Migration complete!`)
  console.log(`   Processed: ${totalProcessed} entities`)
  if (totalErrors > 0) {
    console.log(`   Errors: ${totalErrors}`)
  }
}

backfillSlugs().catch((error) => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})
