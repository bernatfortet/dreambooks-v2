'use client'

import type { BookFilters } from '@/components/books/filters/types'

type BookFilterBarProps = {
  filters: BookFilters
  onFiltersChange: (filters: BookFilters) => void
}

export function BookFilterBar({ filters, onFiltersChange }: BookFilterBarProps) {
  return (
    <div className='border-b bg-gray-50 px-4 py-3'>
      <div className='mx-auto flex max-w-7xl items-center gap-3'>
        <input
          type='text'
          placeholder='Search books...'
          value={filters.search ?? ''}
          onChange={(event) => onFiltersChange({ ...filters, search: event.target.value || undefined })}
          className='rounded-md border px-3 py-1.5 text-sm'
        />
      </div>
    </div>
  )
}
