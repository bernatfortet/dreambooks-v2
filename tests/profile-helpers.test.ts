import { describe, expect, test } from 'bun:test'
import type { Id } from '@/convex/_generated/dataModel'
import { getToggledProfileBookState } from '@/convex/lib/profileBookStates'
import { resolveSeriesReadState } from '@/convex/lib/profileSeriesStates'
import { getToggledTimestampState } from '@/convex/lib/profileStateToggles'
import {
  buildSelfProfilePatch,
  getDefaultProfileId,
  getProfilePublicVisibility,
  getProfileSlugCandidate,
  hasSelfProfileChanges,
  isProfilePublic,
  isProfileOwnedByUser,
  sortProfilesForDisplay,
} from '@/convex/lib/profiles'
import { selectPreferredActiveProfileId } from '@/lib/profiles/active-profile'

const SELF_PROFILE_ID = 'profile_self' as Id<'profiles'>
const CHILD_PROFILE_ID = 'profile_child' as Id<'profiles'>
const USER_ID = 'user_1' as Id<'users'>
const OTHER_USER_ID = 'user_2' as Id<'users'>

describe('profile helpers', () => {
  test('sortProfilesForDisplay keeps self profile first', () => {
    const sortedProfiles = sortProfilesForDisplay([
      { _id: CHILD_PROFILE_ID, createdAt: 20, name: 'Milo', type: 'child' as const },
      { _id: SELF_PROFILE_ID, createdAt: 10, name: 'Avery', type: 'self' as const },
    ])

    expect(sortedProfiles.map((profile) => profile._id)).toEqual([SELF_PROFILE_ID, CHILD_PROFILE_ID])
  })

  test('getDefaultProfileId prefers the self profile', () => {
    const defaultProfileId = getDefaultProfileId([
      { _id: CHILD_PROFILE_ID, createdAt: 20, name: 'Milo', type: 'child' as const },
      { _id: SELF_PROFILE_ID, createdAt: 10, name: 'Avery', type: 'self' as const },
    ])

    expect(defaultProfileId).toBe(SELF_PROFILE_ID)
  })

  test('buildSelfProfilePatch falls back from name to email', () => {
    expect(buildSelfProfilePatch({ name: '  Avery  ', email: 'avery@example.com' })).toEqual({
      name: 'Avery',
    })

    expect(buildSelfProfilePatch({ email: 'avery@example.com' })).toEqual({
      name: 'avery@example.com',
    })
  })

  test('hasSelfProfileChanges stays false when self profile is already synced', () => {
    const nextProfilePatch = buildSelfProfilePatch({
      name: 'Avery',
      imageUrl: 'https://example.com/avatar.png',
    })

    expect(
      hasSelfProfileChanges(
        {
          name: 'Avery',
          imageUrl: 'https://example.com/avatar.png',
        },
        nextProfilePatch,
      ),
    ).toBe(false)
  })

  test('hasSelfProfileChanges detects changed display data', () => {
    const nextProfilePatch = buildSelfProfilePatch({
      name: 'Avery',
      imageUrl: 'https://example.com/new-avatar.png',
    })

    expect(
      hasSelfProfileChanges(
        {
          name: 'Avery Teen',
          imageUrl: 'https://example.com/avatar.png',
        },
        nextProfilePatch,
      ),
    ).toBe(true)
  })

  test('isProfileOwnedByUser validates ownership', () => {
    expect(
      isProfileOwnedByUser(
        {
          ownerUserId: USER_ID,
        },
        USER_ID,
      ),
    ).toBe(true)

    expect(
      isProfileOwnedByUser(
        {
          ownerUserId: USER_ID,
        },
        OTHER_USER_ID,
      ),
    ).toBe(false)
  })

  test('getProfileSlugCandidate falls back when a name has no slug characters', () => {
    expect(getProfileSlugCandidate('Avery Teen')).toBe('avery-teen')
    expect(getProfileSlugCandidate('!!!')).toBe('profile')
  })

  test('public visibility defaults to public for legacy profiles', () => {
    expect(getProfilePublicVisibility(undefined)).toBe('public')
    expect(isProfilePublic(undefined)).toBe(true)
  })

  test('explicit private visibility hides a profile', () => {
    expect(
      getProfilePublicVisibility({
        publicVisibility: 'private',
      }),
    ).toBe('private')

    expect(
      isProfilePublic({
        publicVisibility: 'private',
      }),
    ).toBe(false)
  })

  test('child profiles can be public', () => {
    expect(
      isProfilePublic({
        publicVisibility: 'public',
      }),
    ).toBe(true)
  })
})

describe('profile book state helpers', () => {
  test('generic timestamp toggle deletes when all fields clear', () => {
    expect(
      getToggledTimestampState({
        currentState: {
          likedAt: 123,
        },
        field: 'likedAt',
        now: 456,
        supportedFields: ['likedAt'],
      }),
    ).toEqual({
      operation: 'delete',
    })
  })

  test('creates a liked state when none exists', () => {
    expect(
      getToggledProfileBookState({
        currentState: null,
        field: 'likedAt',
        now: 123,
      }),
    ).toEqual({
      operation: 'upsert',
      value: {
        likedAt: 123,
        updatedAt: 123,
      },
    })
  })

  test('removes the final active field by deleting the row', () => {
    expect(
      getToggledProfileBookState({
        currentState: {
          likedAt: 123,
        },
        field: 'likedAt',
        now: 456,
      }),
    ).toEqual({
      operation: 'delete',
    })
  })

  test('preserves other profile book state fields when toggling', () => {
    expect(
      getToggledProfileBookState({
        currentState: {
          likedAt: 123,
        },
        field: 'readAt',
        now: 456,
      }),
    ).toEqual({
      operation: 'upsert',
      value: {
        likedAt: 123,
        readAt: 456,
        updatedAt: 456,
      },
    })
  })
})

describe('profile series state helpers', () => {
  test('prefers explicit read over derived read', () => {
    expect(
      resolveSeriesReadState({
        explicitReadAt: 900,
        visibleBookCount: 3,
        readBookTimestamps: [100, 400, 700],
      }),
    ).toEqual({
      derivedReadAt: 700,
      readAt: 900,
      isRead: true,
      readSource: 'explicit',
    })
  })

  test('derives read state when every visible book is read', () => {
    expect(
      resolveSeriesReadState({
        visibleBookCount: 2,
        readBookTimestamps: [120, 450],
      }),
    ).toEqual({
      derivedReadAt: 450,
      readAt: 450,
      isRead: true,
      readSource: 'derived',
    })
  })

  test('does not derive read state when any visible book is unread', () => {
    expect(
      resolveSeriesReadState({
        visibleBookCount: 3,
        readBookTimestamps: [120, 450],
      }),
    ).toEqual({
      derivedReadAt: null,
      readAt: null,
      isRead: false,
      readSource: null,
    })
  })
})

describe('active profile selection', () => {
  test('prefers a stored profile when it is still valid', () => {
    const selectedProfileId = selectPreferredActiveProfileId({
      profiles: [{ _id: SELF_PROFILE_ID }, { _id: CHILD_PROFILE_ID }],
      storedActiveProfileId: CHILD_PROFILE_ID,
      defaultProfileId: SELF_PROFILE_ID,
    })

    expect(selectedProfileId).toBe(CHILD_PROFILE_ID)
  })

  test('falls back to the default profile when the stored one is missing', () => {
    const selectedProfileId = selectPreferredActiveProfileId({
      profiles: [{ _id: SELF_PROFILE_ID }, { _id: CHILD_PROFILE_ID }],
      storedActiveProfileId: 'missing',
      defaultProfileId: SELF_PROFILE_ID,
    })

    expect(selectedProfileId).toBe(SELF_PROFILE_ID)
  })
})
