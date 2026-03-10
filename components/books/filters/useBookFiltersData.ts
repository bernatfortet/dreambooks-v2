'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function useBookFiltersData() {
  const awards = useQuery(api.awards.queries.list)
  const filterOptions = useQuery(api.books.queries.getFilterOptions)

  return {
    awards: awards ?? null,
    filterOptions: filterOptions ?? null,
    isLoading: awards === undefined || filterOptions === undefined,
  }
}
