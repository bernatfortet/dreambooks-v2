import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { mutation } from '../_generated/server'
import { requireOwnedProfile } from '../lib/profiles'
import { getToggledTimestampState } from '../lib/profileStateToggles'

const PROFILE_SERIES_STATE_FIELDS = ['likedAt', 'readAt'] as const

export const toggleLike = mutation({
  args: {
    profileId: v.id('profiles'),
    seriesId: v.id('series'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await toggleProfileSeriesStateField({
      context,
      profileId: args.profileId,
      seriesId: args.seriesId,
      field: 'likedAt',
    })

    return null
  },
})

export const toggleRead = mutation({
  args: {
    profileId: v.id('profiles'),
    seriesId: v.id('series'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await toggleProfileSeriesStateField({
      context,
      profileId: args.profileId,
      seriesId: args.seriesId,
      field: 'readAt',
    })

    return null
  },
})

async function toggleProfileSeriesStateField(args: {
  context: MutationCtx
  profileId: Id<'profiles'>
  seriesId: Id<'series'>
  field: 'likedAt' | 'readAt'
}) {
  await requireOwnedProfile(args.context, args.profileId)

  const existingProfileSeriesState = await args.context.db
    .query('profileSeriesStates')
    .withIndex('by_profileId_seriesId', (query) => query.eq('profileId', args.profileId).eq('seriesId', args.seriesId))
    .unique()

  const mutationPlan = getToggledTimestampState({
    currentState: existingProfileSeriesState
      ? {
          likedAt: existingProfileSeriesState.likedAt,
          readAt: existingProfileSeriesState.readAt,
        }
      : null,
    field: args.field,
    now: Date.now(),
    supportedFields: PROFILE_SERIES_STATE_FIELDS,
  })

  if (!existingProfileSeriesState) {
    if (mutationPlan.operation === 'delete') {
      return
    }

    await args.context.db.insert('profileSeriesStates', {
      profileId: args.profileId,
      seriesId: args.seriesId,
      ...mutationPlan.value,
    })
    return
  }

  if (mutationPlan.operation === 'delete') {
    await args.context.db.delete(existingProfileSeriesState._id)
    return
  }

  await args.context.db.patch(existingProfileSeriesState._id, mutationPlan.value)
}
