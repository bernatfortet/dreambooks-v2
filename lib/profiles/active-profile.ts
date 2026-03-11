export type SelectableProfile = {
  _id: string
}

const ACTIVE_PROFILE_STORAGE_KEY = 'dreambooks-active-profile:v1'

export function getActiveProfileStorageKey() {
  return ACTIVE_PROFILE_STORAGE_KEY
}

export function loadStoredActiveProfileId() {
  try {
    return window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveStoredActiveProfileId(profileId: string) {
  try {
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId)
  } catch {
    // Ignore storage errors.
  }
}

export function clearStoredActiveProfileId() {
  try {
    window.localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY)
  } catch {
    // Ignore storage errors.
  }
}

export function selectPreferredActiveProfileId(args: {
  profiles: SelectableProfile[]
  storedActiveProfileId: string | null
  defaultProfileId: string | null
}) {
  const validProfileIds = new Set(args.profiles.map((profile) => profile._id))

  if (args.storedActiveProfileId && validProfileIds.has(args.storedActiveProfileId)) {
    return args.storedActiveProfileId
  }

  if (args.defaultProfileId && validProfileIds.has(args.defaultProfileId)) {
    return args.defaultProfileId
  }

  return args.profiles[0]?._id ?? null
}
