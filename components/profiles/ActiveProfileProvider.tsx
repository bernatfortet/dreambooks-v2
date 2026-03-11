'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import {
  clearStoredActiveProfileId,
  getActiveProfileStorageKey,
  loadStoredActiveProfileId,
  saveStoredActiveProfileId,
  selectPreferredActiveProfileId,
} from '@/lib/profiles/active-profile'

type ProfileBootstrap = NonNullable<FunctionReturnType<typeof api.profiles.queries.bootstrap>>
type ActiveProfile = ProfileBootstrap['profiles'][number]

type ActiveProfileContextValue = {
  activeProfile: ActiveProfile | null
  activeProfileId: string | null
  isLoading: boolean
  profiles: ActiveProfile[]
  setActiveProfileId: (profileId: string) => void
}

const ActiveProfileContext = createContext<ActiveProfileContextValue | null>(null)

export function ActiveProfileProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth()
  const bootstrap = useQuery(api.profiles.queries.bootstrap, {})
  const ensureSelfProfile = useMutation(api.profiles.mutations.ensureSelfProfile)
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(loadStoredActiveProfileId)
  const ensureAttemptedRef = useRef(false)

  const profiles = bootstrap?.profiles ?? []
  const defaultProfileId = bootstrap?.defaultProfileId ?? null
  const isLoading = isAuthLoading || (isAuthenticated && bootstrap === undefined)

  useEffect(() => {
    if (!isAuthenticated) {
      ensureAttemptedRef.current = false
      setActiveProfileIdState(null)
      clearStoredActiveProfileId()
      return
    }

    if (ensureAttemptedRef.current) return

    ensureAttemptedRef.current = true
    void ensureSelfProfile()
  }, [ensureSelfProfile, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !bootstrap) return

    const nextActiveProfileId = selectPreferredActiveProfileId({
      profiles,
      storedActiveProfileId: activeProfileId,
      defaultProfileId,
    })

    if (nextActiveProfileId === activeProfileId) return

    setActiveProfileIdState(nextActiveProfileId)
    setStoredActiveProfileId(nextActiveProfileId)
  }, [activeProfileId, bootstrap, defaultProfileId, isAuthenticated, profiles])

  useEffect(() => {
    const storageKey = getActiveProfileStorageKey()

    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey) return
      setActiveProfileIdState(event.newValue)
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const activeProfile = useMemo(() => {
    if (!activeProfileId) return null

    return profiles.find((profile: ActiveProfile) => profile._id === activeProfileId) ?? null
  }, [activeProfileId, profiles])

  const contextValue = useMemo<ActiveProfileContextValue>(
    () => ({
      activeProfile,
      activeProfileId,
      isLoading,
      profiles,
      setActiveProfileId: (profileId) => {
        setActiveProfileIdState(profileId)
        setStoredActiveProfileId(profileId)
      },
    }),
    [activeProfile, activeProfileId, isLoading, profiles],
  )

  return <ActiveProfileContext.Provider value={contextValue}>{children}</ActiveProfileContext.Provider>
}

export function useActiveProfile() {
  const context = useContext(ActiveProfileContext)
  if (!context) {
    throw new Error('useActiveProfile must be used within ActiveProfileProvider')
  }

  return context
}

function setStoredActiveProfileId(profileId: string | null) {
  if (profileId) {
    saveStoredActiveProfileId(profileId)
    return
  }

  clearStoredActiveProfileId()
}
