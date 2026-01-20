#!/usr/bin/env bun

import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

const convexUrl = process.env.CONVEX_URL

if (!convexUrl) {
  console.error('❌ CONVEX_URL environment variable is not set')
  process.exit(1)
}

console.log('🗑️  Deleting ALL storage files...')
console.log('⚠️  This will delete ALL images (book covers, series covers, author images, award images)!')
console.log('')

const client = new ConvexHttpClient(convexUrl)

try {
  const result = await client.action(api.admin.clearDatabase.deleteAllStorageFiles, {})

  console.log('')
  console.log('✅ Storage files deletion complete!')
  console.log('')
  console.log('Deleted:')
  console.log(`  - Book Covers: ${result.deleted.bookCovers}`)
  console.log(`  - Series Covers: ${result.deleted.seriesCovers}`)
  console.log(`  - Author Images: ${result.deleted.authorImages}`)
  console.log(`  - Award Images: ${result.deleted.awardImages}`)
  console.log(`  - Total: ${result.deleted.total}`)
  console.log('')
  console.log('Note: Orphaned storage files (from already-deleted records) cannot be detected')
  console.log('and will remain in storage. They are harmless but will use storage quota.')
} catch (error) {
  console.error('❌ Error deleting storage files:', error)
  process.exit(1)
}
