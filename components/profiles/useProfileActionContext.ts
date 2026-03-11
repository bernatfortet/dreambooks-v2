'use client'

import { useConvexAuth } from 'convex/react'
import type { Id } from '@/convex/_generated/dataModel'
import { useActiveProfile } from './ActiveProfileProvider'

export function useProfileActionContext() {
  const { isAuthenticated } = useConvexAuth()
  const { activeProfile, activeProfileId, isLoading } = useActiveProfile()

  const resolvedActiveProfileId = activeProfileId ? (activeProfileId as Id<'profiles'>) : null
  const canRenderActions = isAuthenticated && !isLoading && activeProfile !== null && resolvedActiveProfileId !== null

  return {
    activeProfile,
    activeProfileId: resolvedActiveProfileId,
    canRenderActions,
    isLoading,
  }
}
