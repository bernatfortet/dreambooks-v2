import { v } from 'convex/values'
import { query } from '../_generated/server'
import { requireOwnedProfile } from '../lib/profiles'
import { getResolvedProfileSeriesState } from '../lib/profileSeriesStates'

const resolvedProfileSeriesStateValidator = v.object({
  likedAt: v.union(v.number(), v.null()),
  explicitReadAt: v.union(v.number(), v.null()),
  derivedReadAt: v.union(v.number(), v.null()),
  readAt: v.union(v.number(), v.null()),
  isRead: v.boolean(),
  readSource: v.union(v.literal('explicit'), v.literal('derived'), v.null()),
  updatedAt: v.union(v.number(), v.null()),
})

export const getForSeries = query({
  args: {
    profileId: v.id('profiles'),
    seriesId: v.id('series'),
  },
  returns: resolvedProfileSeriesStateValidator,
  handler: async (context, args) => {
    await requireOwnedProfile(context, args.profileId)

    return await getResolvedProfileSeriesState(context, args)
  },
})
