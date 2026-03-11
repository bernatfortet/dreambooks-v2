import { getToggledTimestampState, type ProfileTimestampStateMutationPlan } from './profileStateToggles'

export type ProfileBookStateField = 'likedAt' | 'readAt'

export type ProfileBookStateSnapshot = {
  likedAt?: number
  readAt?: number
} | null

type ProfileBookStateMutationPlan = ProfileTimestampStateMutationPlan<ProfileBookStateField>

const PROFILE_BOOK_STATE_FIELDS = ['likedAt', 'readAt'] as const

export function getToggledProfileBookState(args: {
  currentState: ProfileBookStateSnapshot
  field: ProfileBookStateField
  now: number
}): ProfileBookStateMutationPlan {
  return getToggledTimestampState({
    currentState: args.currentState,
    field: args.field,
    now: args.now,
    supportedFields: PROFILE_BOOK_STATE_FIELDS,
  })
}
