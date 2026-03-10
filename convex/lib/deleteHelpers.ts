import { DatabaseWriter } from '../_generated/server'
import { Id } from '../_generated/dataModel'

/**
 * Delete all scrape artifacts for a given entity.
 */
export async function deleteScrapeArtifacts(
  db: DatabaseWriter,
  entityType: 'book' | 'series' | 'author',
  entityId: Id<'books'> | Id<'series'> | Id<'authors'>,
): Promise<number> {
  const artifacts = await db
    .query('scrapeArtifacts')
    .withIndex('by_entityId', (q) => q.eq('entityId', entityId))
    .collect()

  for (const artifact of artifacts) {
    await db.delete(artifact._id)
  }

  return artifacts.length
}

/**
 * Clear entity references from scrape queue entries.
 * Sets the appropriate ID field to undefined rather than deleting queue entries
 * (preserves history).
 */
export async function clearScrapeQueueReferences(
  db: DatabaseWriter,
  entityType: 'book' | 'series' | 'author',
  entityId: Id<'books'> | Id<'series'> | Id<'authors'>,
): Promise<number> {
  const queueEntries = await db.query('scrapeQueue').collect()
  let clearedCount = 0

  for (const entry of queueEntries) {
    let needsUpdate = false
    const updates: Partial<{
      bookId: Id<'books'> | undefined
      seriesId: Id<'series'> | undefined
      authorId: Id<'authors'> | undefined
    }> = {}

    if (entityType === 'book' && entry.bookId === entityId) {
      updates.bookId = undefined
      needsUpdate = true
    } else if (entityType === 'series' && entry.seriesId === entityId) {
      updates.seriesId = undefined
      needsUpdate = true
    } else if (entityType === 'author' && entry.authorId === entityId) {
      updates.authorId = undefined
      needsUpdate = true
    }

    if (needsUpdate) {
      await db.patch(entry._id, updates)
      clearedCount++
    }
  }

  return clearedCount
}

/**
 * Delete a storage file if it exists.
 * Returns true if a file was deleted, false otherwise.
 */
export async function deleteStorageFile(
  storage: { delete: (storageId: Id<'_storage'>) => Promise<void> },
  storageId: Id<'_storage'> | undefined,
): Promise<boolean> {
  if (!storageId) {
    return false
  }

  try {
    await storage.delete(storageId)
    return true
  } catch (error) {
    // Non-fatal - file might already be deleted
    console.log('⚠️ Failed to delete storage file', { storageId, error })
    return false
  }
}
