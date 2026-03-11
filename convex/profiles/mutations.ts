import { mutation } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { v } from 'convex/values'
import { getViewerIdentity } from '../lib/viewerProfile'
import {
  buildSelfProfilePatch,
  generateUniqueProfileSlug,
  hasSelfProfileChanges,
  listProfilesForOwner,
} from '../lib/profiles'

export const ensureSelfProfile = mutation({
  args: {},
  returns: v.id('profiles'),
  handler: async (context) => {
    const viewerIdentity = await getViewerIdentity(context)
    if (!viewerIdentity) {
      throw new Error('Unauthorized')
    }

    const selfProfilePatch = buildSelfProfilePatch(viewerIdentity)
    const ownedProfiles = await listProfilesForOwner(context, viewerIdentity.userId)
    const existingSelfProfile = ownedProfiles.find((profile) => profile.type === 'self') ?? null
    const now = Date.now()

    if (existingSelfProfile) {
      const selfProfileUpdates = await buildSelfProfileUpdates({
        context,
        existingSelfProfile,
        now,
        selfProfilePatch,
      })

      if (selfProfileUpdates) {
        await context.db.patch(existingSelfProfile._id, selfProfileUpdates)
      }

      await backfillOwnedChildProfiles({
        context,
        now,
        ownedProfiles,
      })

      return existingSelfProfile._id
    }

    const slug = await generateUniqueProfileSlug({
      context,
      name: selfProfilePatch.name,
    })

    const selfProfileId = await context.db.insert('profiles', {
      ownerUserId: viewerIdentity.userId,
      ...selfProfilePatch,
      slug,
      publicVisibility: 'public',
      type: 'self',
      createdAt: now,
      updatedAt: now,
    })

    await backfillOwnedChildProfiles({
      context,
      now,
      ownedProfiles,
    })

    return selfProfileId
  },
})

export const createChild = mutation({
  args: {
    name: v.string(),
  },
  returns: v.id('profiles'),
  handler: async (context, args) => {
    const viewerIdentity = await getViewerIdentity(context)
    if (!viewerIdentity) {
      throw new Error('Unauthorized')
    }

    const trimmedName = args.name.trim()
    if (!trimmedName) {
      throw new Error('Profile name is required')
    }

    const now = Date.now()
    const slug = await generateUniqueProfileSlug({
      context,
      name: trimmedName,
    })

    return await context.db.insert('profiles', {
      ownerUserId: viewerIdentity.userId,
      name: trimmedName,
      slug,
      publicVisibility: 'public',
      type: 'child',
      createdAt: now,
      updatedAt: now,
    })
  },
})

async function buildSelfProfileUpdates(args: {
  context: MutationCtx
  existingSelfProfile: Awaited<ReturnType<typeof listProfilesForOwner>>[number]
  now: number
  selfProfilePatch: ReturnType<typeof buildSelfProfilePatch>
}) {
  const updates = await buildLegacyProfileBackfillPatch({
    context: args.context,
    profile: args.existingSelfProfile,
  })

  if (hasSelfProfileChanges(args.existingSelfProfile, args.selfProfilePatch)) {
    Object.assign(updates, args.selfProfilePatch)
  }

  if (Object.keys(updates).length === 0) {
    return null
  }

  return {
    ...updates,
    updatedAt: args.now,
  }
}

async function backfillOwnedChildProfiles(args: {
  context: MutationCtx
  now: number
  ownedProfiles: Awaited<ReturnType<typeof listProfilesForOwner>>
}) {
  for (const profile of args.ownedProfiles) {
    if (profile.type !== 'child') continue

    const updates = await buildLegacyProfileBackfillPatch({
      context: args.context,
      profile,
    })
    if (Object.keys(updates).length === 0) continue

    await args.context.db.patch(profile._id, {
      ...updates,
      updatedAt: args.now,
    })
  }
}

async function buildLegacyProfileBackfillPatch(args: {
  context: MutationCtx
  profile: Pick<Doc<'profiles'>, '_id' | 'name' | 'publicVisibility' | 'slug'>
}) {
  const updates: Partial<Pick<Doc<'profiles'>, 'publicVisibility' | 'slug'>> = {}

  if (args.profile.slug === undefined) {
    updates.slug = await generateUniqueProfileSlug({
      context: args.context,
      name: args.profile.name,
      excludeProfileId: args.profile._id,
    })
  }

  if (args.profile.publicVisibility === undefined) {
    updates.publicVisibility = 'public'
  }

  return updates
}
