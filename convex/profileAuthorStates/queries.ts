import { v } from 'convex/values'
import { query } from '../_generated/server'
import { requireOwnedProfile } from '../lib/profiles'

const profileAuthorStateValidator = v.object({
  likedAt: v.union(v.number(), v.null()),
  updatedAt: v.union(v.number(), v.null()),
})

export const getForAuthor = query({
  args: {
    profileId: v.id('profiles'),
    authorId: v.id('authors'),
  },
  returns: profileAuthorStateValidator,
  handler: async (context, args) => {
    await requireOwnedProfile(context, args.profileId)

    const profileAuthorState = await context.db
      .query('profileAuthorStates')
      .withIndex('by_profileId_authorId', (query) => query.eq('profileId', args.profileId).eq('authorId', args.authorId))
      .unique()

    return {
      likedAt: profileAuthorState?.likedAt ?? null,
      updatedAt: profileAuthorState?.updatedAt ?? null,
    }
  },
})
