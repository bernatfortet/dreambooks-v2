'use client'

import type { ReactNode } from 'react'
import { useSuperadmin } from '@/components/auth/use-superadmin'

type SuperadminOnlyProps = {
  children: ReactNode
}

export function SuperadminOnly({ children }: SuperadminOnlyProps) {
  const { isSuperadmin } = useSuperadmin()

  if (!isSuperadmin) return null

  return <>{children}</>
}
