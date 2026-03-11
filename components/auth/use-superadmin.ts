'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function useSuperadmin() {
  const viewer = useQuery(api.users.queries.viewer)

  return {
    isLoading: viewer === undefined,
    isSuperadmin: viewer?.isSuperadmin === true,
  }
}
