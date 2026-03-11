import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { mutation } from '../_generated/server'
import { requireOwnedProfile } from '../lib/profiles'
import { getToggledTimestampState } from '../lib/profileStateToggles'

const PROFILE_AUTHOR_STATE_FIELDS = ['likedAt'] as const

export const toggleLike = mutation({
  args: {
    profileId: v.id('profiles'),
    authorId: v.id('authors'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await toggleProfileAuthorStateField({
      context,
      profileId: args.profileId,
      authorId: args.authorId,
      field: 'likedAt',
    })

    return null
  },
})

async function toggleProfileAuthorStateField(args: {
  context: MutationCtx
  profileId: Id<'profiles'>
  authorId: Id<'authors'>
  field: 'likedAt'
}) {
  await requireOwnedProfile(args.context, args.profileId)

  const existingProfileAuthorState = await args.context.db
    .query('profileAuthorStates')
    .withIndex('by_profileId_authorId', (query) => query.eq('profileId', args.profileId).eq('authorId', args.authorId))
    .unique()

  const mutationPlan = getToggledTimestampState({
    currentState: existingProfileAuthorState
      ? {
          likedAt: existingProfileAuthorState.likedAt,
        }
      : null,
    field: args.field,
    now: Date.now(),
    supportedFields: PROFILE_AUTHOR_STATE_FIELDS,
  })

  if (!existingProfileAuthorState) {
    if (mutationPlan.operation === 'delete') {
      return
    }

    await args.context.db.insert('profileAuthorStates', {
      profileId: args.profileId,
      authorId: args.authorId,
      ...mutationPlan.value,
    })
    return
  }

  if (mutationPlan.operation === 'delete') {
    await args.context.db.delete(existingProfileAuthorState._id)
    return
  }

  await args.context.db.patch(existingProfileAuthorState._id, mutationPlan.value)
}
