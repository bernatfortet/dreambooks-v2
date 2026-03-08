'use client'

import type { BookFilters } from './filters/types'

type BookFilterBarProps = {
  filters: BookFilters
  onFiltersChange: (filters: BookFilters) => void
}

export function BookFilterBar({ filters: _filters, onFiltersChange: _onFiltersChange }: BookFilterBarProps) {
  return (
    <div className='w-full border-b bg-white'>
      <div className='container mx-auto px-4 py-3 flex items-center gap-4'>
        <span className='text-sm text-muted-foreground'>Filters</span>
      </div>
    </div>
  )
}
