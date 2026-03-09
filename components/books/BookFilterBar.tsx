'use client'

import { useQuery } from 'convex/react'

import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/PageContainer'
import type { BookFilters, SeriesFilter } from '@/components/books/filters/types'

type BookFilterBarProps = {
  filters: BookFilters
  onFiltersChange: (filters: BookFilters) => void
}

type FilterBucket = {
  id: string
  label: string
  count: number
}

export function BookFilterBar({ filters, onFiltersChange }: BookFilterBarProps) {
  const filterOptions = useQuery(api.books.queries.getFilterOptions) as
    | {
        ageRangeBuckets: FilterBucket[]
        gradeLevelBuckets: FilterBucket[]
      }
    | undefined

  function updateSeriesFilter(seriesFilter: SeriesFilter) {
    if (seriesFilter === 'all') {
      onFiltersChange(removeEmptyFilters({ ...filters, seriesFilter: undefined }))
      return
    }

    onFiltersChange(removeEmptyFilters({ ...filters, seriesFilter }))
  }

  function toggleBucket(filterKey: 'ageRangeBuckets' | 'gradeLevelBuckets', value: string) {
    const currentValues = filters[filterKey] ?? []
    const nextValues = currentValues.includes(value)
      ? currentValues.filter((currentValue) => currentValue !== value)
      : [...currentValues, value]

    onFiltersChange(removeEmptyFilters({ ...filters, [filterKey]: nextValues }))
  }

  function resetFilters() {
    onFiltersChange({})
  }

  const selectedSeriesFilter = filters.seriesFilter ?? 'all'

  return (
    <div className='border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'>
      <PageContainer className='space-y-4 py-4'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
          <div>
            <p className='text-sm font-medium'>Browse books</p>
            <p className='text-sm text-muted-foreground'>Filter the catalog by age range, grade level, and series status.</p>
          </div>

          <Button variant='outline' size='sm' onClick={resetFilters}>
            Clear filters
          </Button>
        </div>

        <div className='space-y-4'>
          <FilterSection
            title='Series'
            options={[
              { id: 'all', label: 'All books' },
              { id: 'with-series', label: 'In a series' },
              { id: 'standalone', label: 'Standalone' },
            ]}
            selectedValues={[selectedSeriesFilter]}
            onToggle={(value) => updateSeriesFilter(value as SeriesFilter)}
            singleSelect
          />

          <FilterSection
            title='Age range'
            options={filterOptions?.ageRangeBuckets ?? []}
            selectedValues={filters.ageRangeBuckets ?? []}
            onToggle={(value) => toggleBucket('ageRangeBuckets', value)}
          />

          <FilterSection
            title='Grade level'
            options={filterOptions?.gradeLevelBuckets ?? []}
            selectedValues={filters.gradeLevelBuckets ?? []}
            onToggle={(value) => toggleBucket('gradeLevelBuckets', value)}
          />
        </div>
      </PageContainer>
    </div>
  )
}

type FilterSectionProps = {
  title: string
  options: Array<{ id: string; label: string; count?: number }>
  selectedValues: string[]
  onToggle: (value: string) => void
  singleSelect?: boolean
}

function FilterSection({ title, options, selectedValues, onToggle, singleSelect = false }: FilterSectionProps) {
  if (options.length === 0) {
    return (
      <div className='space-y-2'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-sm text-muted-foreground'>Loading options...</p>
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{title}</p>

      <div className='flex flex-wrap gap-2'>
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.id)

          return (
            <Button
              key={option.id}
              variant={isSelected ? 'default' : 'outline'}
              size='sm'
              onClick={() => onToggle(option.id)}
              aria-pressed={isSelected}
            >
              {option.label}
              {!singleSelect && option.count !== undefined ? ` (${option.count})` : ''}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

function removeEmptyFilters(filters: BookFilters): BookFilters {
  const nextFilters: BookFilters = {}

  if (filters.ageRangeBuckets && filters.ageRangeBuckets.length > 0) {
    nextFilters.ageRangeBuckets = filters.ageRangeBuckets
  }

  if (filters.gradeLevelBuckets && filters.gradeLevelBuckets.length > 0) {
    nextFilters.gradeLevelBuckets = filters.gradeLevelBuckets
  }

  if (filters.awardIds && filters.awardIds.length > 0) {
    nextFilters.awardIds = filters.awardIds
  }

  if (filters.seriesFilter) {
    nextFilters.seriesFilter = filters.seriesFilter
  }

  return nextFilters
}
