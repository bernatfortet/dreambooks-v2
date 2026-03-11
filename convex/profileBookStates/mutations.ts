import { mutation } from '../_generated/server'
import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { getToggledProfileBookState } from '../lib/profileBookStates'
import { requireOwnedProfile } from '../lib/profiles'

export const toggleLike = mutation({
  args: {
    profileId: v.id('profiles'),
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await toggleProfileBookStateField({
      context,
      profileId: args.profileId,
      bookId: args.bookId,
      field: 'likedAt',
    })

    return null
  },
})

export const toggleRead = mutation({
  args: {
    profileId: v.id('profiles'),
    bookId: v.id('books'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await toggleProfileBookStateField({
      context,
      profileId: args.profileId,
      bookId: args.bookId,
      field: 'readAt',
    })

    return null
  },
})

async function toggleProfileBookStateField(args: {
  context: MutationCtx
  profileId: Id<'profiles'>
  bookId: Id<'books'>
  field: 'likedAt' | 'readAt'
}) {
  await requireOwnedProfile(args.context, args.profileId)

  const existingProfileBookState = await args.context.db
    .query('profileBookStates')
    .withIndex('by_profileId_bookId', (query) => query.eq('profileId', args.profileId).eq('bookId', args.bookId))
    .unique()

  const mutationPlan = getToggledProfileBookState({
    currentState: existingProfileBookState
      ? {
          likedAt: existingProfileBookState.likedAt,
          readAt: existingProfileBookState.readAt,
        }
      : null,
    field: args.field,
    now: Date.now(),
  })

  if (!existingProfileBookState) {
    if (mutationPlan.operation === 'delete') {
      return
    }

    await args.context.db.insert('profileBookStates', {
      profileId: args.profileId,
      bookId: args.bookId,
      ...mutationPlan.value,
    })
    return
  }

  if (mutationPlan.operation === 'delete') {
    await args.context.db.delete(existingProfileBookState._id)
    return
  }

  await args.context.db.patch(existingProfileBookState._id, mutationPlan.value)
}
