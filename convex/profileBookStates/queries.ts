import { query } from '../_generated/server'
import { v } from 'convex/values'
import { requireOwnedProfile } from '../lib/profiles'

export const getForBook = query({
  args: {
    profileId: v.id('profiles'),
    bookId: v.id('books'),
  },
  returns: v.union(
    v.null(),
    v.object({
      likedAt: v.optional(v.number()),
      readAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (context, args) => {
    await requireOwnedProfile(context, args.profileId)

    const profileBookState = await context.db
      .query('profileBookStates')
      .withIndex('by_profileId_bookId', (query) => query.eq('profileId', args.profileId).eq('bookId', args.bookId))
      .unique()

    if (!profileBookState) return null

    return {
      likedAt: profileBookState.likedAt,
      readAt: profileBookState.readAt,
      updatedAt: profileBookState.updatedAt,
    }
  },
})
