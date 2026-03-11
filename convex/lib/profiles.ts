import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { toSlug } from './slug'

type ProfileContext = MutationCtx | QueryCtx
type ProfileSummary = Pick<Doc<'profiles'>, '_id' | 'createdAt' | 'imageUrl' | 'name' | 'publicVisibility' | 'slug' | 'type' | 'updatedAt'>
type SortableProfileSummary = Pick<Doc<'profiles'>, '_id' | 'createdAt' | 'name' | 'type'>

export const profileTypeValidator = v.union(v.literal('self'), v.literal('child'))
export const profilePublicVisibilityValidator = v.union(v.literal('public'), v.literal('private'))

export const profileValidator = v.object({
  _id: v.id('profiles'),
  name: v.string(),
  type: profileTypeValidator,
  imageUrl: v.optional(v.string()),
  slug: v.optional(v.string()),
  publicVisibility: v.optional(profilePublicVisibilityValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export function sortProfilesForDisplay<T extends SortableProfileSummary>(profiles: T[]) {
  return [...profiles].sort((leftProfile, rightProfile) => {
    if (leftProfile.type !== rightProfile.type) {
      return leftProfile.type === 'self' ? -1 : 1
    }

    if (leftProfile.createdAt !== rightProfile.createdAt) {
      return leftProfile.createdAt - rightProfile.createdAt
    }

    return leftProfile.name.localeCompare(rightProfile.name)
  })
}

export function getDefaultProfileId<T extends SortableProfileSummary>(profiles: T[]) {
  const sortedProfiles = sortProfilesForDisplay(profiles)
  const defaultProfile = sortedProfiles[0]

  return defaultProfile?._id ?? null
}

export function buildSelfProfilePatch(args: {
  name?: string
  email?: string
  imageUrl?: string
}) {
  const fallbackName = args.name?.trim() || args.email?.trim() || 'My Profile'

  return {
    name: fallbackName,
    ...(args.imageUrl ? { imageUrl: args.imageUrl } : {}),
  }
}

export function hasSelfProfileChanges(
  existingProfile: Pick<ProfileSummary, 'imageUrl' | 'name'>,
  nextProfilePatch: ReturnType<typeof buildSelfProfilePatch>,
) {
  return existingProfile.name !== nextProfilePatch.name || (existingProfile.imageUrl ?? undefined) !== nextProfilePatch.imageUrl
}

export function getProfileSlugCandidate(name: string) {
  const baseSlug = toSlug(name)

  return baseSlug || 'profile'
}

export function getProfilePublicVisibility(
  profile: Pick<ProfileSummary, 'publicVisibility'> | null | undefined,
) {
  return profile?.publicVisibility ?? 'public'
}

export function isProfilePublic(
  profile: Pick<ProfileSummary, 'publicVisibility'> | null | undefined,
) {
  return getProfilePublicVisibility(profile) === 'public'
}

export async function generateUniqueProfileSlug(args: {
  context: ProfileContext
  name: string
  excludeProfileId?: Id<'profiles'>
}) {
  const baseSlug = getProfileSlugCandidate(args.name)
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const existingProfile = await args.context.db
      .query('profiles')
      .withIndex('by_slug', (query) => query.eq('slug', slug))
      .first()

    if (!existingProfile || existingProfile._id === args.excludeProfileId) {
      return slug
    }

    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }
}

export function isProfileOwnedByUser(
  profile: Pick<Doc<'profiles'>, 'ownerUserId'> | null | undefined,
  userId: Id<'users'> | null | undefined,
) {
  if (!profile || !userId) return false

  return profile.ownerUserId === userId
}

export async function listProfilesForOwner(context: ProfileContext, ownerUserId: Id<'users'>) {
  const profiles = await context.db
    .query('profiles')
    .withIndex('by_ownerUserId', (query) => query.eq('ownerUserId', ownerUserId))
    .collect()

  return sortProfilesForDisplay(profiles)
}

export async function requireOwnedProfile(context: ProfileContext, profileId: Id<'profiles'>) {
  const userId = await getAuthUserId(context)
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const profile = await context.db.get(profileId)
  if (!isProfileOwnedByUser(profile, userId)) {
    throw new Error('Unauthorized')
  }

  return profile
}
