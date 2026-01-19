import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Backfill the `source` field on existing scrapeQueue items.
 * Sets all items without a source to 'user' (the default for UI-created items).
 */
export const backfillSource = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (context) => {
    const items = await context.db.query('scrapeQueue').collect()

    let updated = 0

    for (const item of items) {
      if (!item.source) {
        await context.db.patch(item._id, { source: 'user' })
        updated++
      }
    }

    console.log(`✅ Backfilled ${updated} scrapeQueue items with source='user'`)
    return updated
  },
})
