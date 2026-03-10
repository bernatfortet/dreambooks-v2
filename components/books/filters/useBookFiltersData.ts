'use client'

import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'

type Awards = NonNullable<FunctionReturnType<typeof api.awards.queries.list>>
type FilterOptions = FunctionReturnType<typeof api.books.queries.getFilterOptions>

export function useBookFiltersData() {
  const awards: Awards | undefined = useQuery(api.awards.queries.list)
  const filterOptions: FilterOptions | undefined = useQuery(api.books.queries.getFilterOptions)

  return {
    awards: awards ?? null,
    filterOptions: filterOptions ?? null,
    isLoading: awards === undefined || filterOptions === undefined,
  }
}
