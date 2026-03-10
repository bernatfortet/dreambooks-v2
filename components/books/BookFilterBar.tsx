'use client'

import { ChevronDownIcon, XIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import type { BookFilters } from './filters/types'
import { useBookFiltersData } from './filters/useBookFiltersData'

type BookFilterBarProps = {
  filters: BookFilters
  onFiltersChange: (filters: BookFilters) => void
}

export function BookFilterBar({ filters, onFiltersChange }: BookFilterBarProps) {
  const { awards, filterOptions, isLoading } = useBookFiltersData()

  const toggleArrayFilter = <K extends 'ageRangeBuckets' | 'gradeLevelBuckets' | 'awardIds'>(key: K, value: string) => {
    const current: string[] = (filters[key] as string[] | undefined) || []
    const updated = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    onFiltersChange({ ...filters, [key]: updated.length > 0 ? updated : undefined })
  }

  const hasActiveFilters = Object.keys(filters).some((key) => filters[key as keyof BookFilters] !== undefined)

  const isAgeRangeActive = (filters.ageRangeBuckets?.length ?? 0) > 0
  const isGradeLevelActive = (filters.gradeLevelBuckets?.length ?? 0) > 0
  const isAwardsActive = (filters.awardIds?.length ?? 0) > 0
  const isSeriesActive = Boolean(filters.seriesFilter && filters.seriesFilter !== 'all')

  return (
    <div className='sticky top-[52px] z-40 bg-white border-b'>
      <div className='container mx-auto px-4'>
        <div className='flex items-center gap-2 py-1.5 overflow-x-auto whitespace-nowrap'>
          <FilterButton label='Age Range' isActive={isAgeRangeActive} contentWidth='w-64'>
            {isLoading ? (
              <p className='text-sm text-muted-foreground'>Loading...</p>
            ) : !filterOptions?.ageRangeBuckets?.length ? (
              <p className='text-sm text-muted-foreground'>No age range data</p>
            ) : (
              filterOptions.ageRangeBuckets.map((bucket) => (
                <CheckboxItem
                  key={bucket.id}
                  id={`age-${bucket.id}`}
                  label={bucket.label}
                  count={bucket.count}
                  checked={filters.ageRangeBuckets?.includes(bucket.id) || false}
                  disabled={bucket.count === 0}
                  onChange={() => toggleArrayFilter('ageRangeBuckets', bucket.id)}
                />
              ))
            )}
          </FilterButton>

          <FilterButton label='Grade Level' isActive={isGradeLevelActive} contentWidth='w-64' scrollable>
            {isLoading ? (
              <p className='text-sm text-muted-foreground'>Loading...</p>
            ) : !filterOptions?.gradeLevelBuckets?.length ? (
              <p className='text-sm text-muted-foreground'>No grade level data</p>
            ) : (
              filterOptions.gradeLevelBuckets.map((bucket) => (
                <CheckboxItem
                  key={bucket.id}
                  id={`grade-${bucket.id}`}
                  label={bucket.label}
                  count={bucket.count}
                  checked={filters.gradeLevelBuckets?.includes(bucket.id) || false}
                  disabled={bucket.count === 0}
                  onChange={() => toggleArrayFilter('gradeLevelBuckets', bucket.id)}
                />
              ))
            )}
          </FilterButton>

          <FilterButton label='Awards' isActive={isAwardsActive} contentWidth='w-72' scrollable>
            {isLoading ? (
              <p className='text-sm text-muted-foreground'>Loading awards...</p>
            ) : !awards?.length ? (
              <p className='text-sm text-muted-foreground'>No awards available</p>
            ) : (
              awards.map((award) => (
                <CheckboxItem
                  key={award._id}
                  id={`award-${award._id}`}
                  label={award.name}
                  imageUrl={award.imageUrl}
                  checked={filters.awardIds?.includes(award._id) || false}
                  onChange={() => toggleArrayFilter('awardIds', award._id)}
                />
              ))
            )}
          </FilterButton>

          <FilterButton label='Series' isActive={isSeriesActive} contentWidth='w-56'>
            <RadioGroup
              value={filters.seriesFilter || 'all'}
              onValueChange={(value) => onFiltersChange({ ...filters, seriesFilter: value as BookFilters['seriesFilter'] })}
            >
              <div className='space-y-2'>
                <div className='flex items-center space-x-2'>
                  <RadioGroupItem value='all' id='series-all' />
                  <Label htmlFor='series-all' className='text-sm font-normal cursor-pointer'>
                    All books
                  </Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <RadioGroupItem value='with-series' id='series-with' />
                  <Label htmlFor='series-with' className='text-sm font-normal cursor-pointer'>
                    Part of a series
                  </Label>
                </div>
                <div className='flex items-center space-x-2'>
                  <RadioGroupItem value='standalone' id='series-standalone' />
                  <Label htmlFor='series-standalone' className='text-sm font-normal cursor-pointer'>
                    Standalone
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </FilterButton>

          {hasActiveFilters && (
            <Button variant='ghost' size='sm' onClick={() => onFiltersChange({})} className='shrink-0 text-xs'>
              <XIcon className='h-3 w-3 mr-1' />
              Clear all
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

type FilterButtonProps = {
  label: string
  isActive: boolean
  contentWidth: string
  scrollable?: boolean
  children: React.ReactNode
}

function FilterButton({ label, isActive, contentWidth, scrollable, children }: FilterButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={isActive ? 'secondary' : 'outline'}
          size='sm'
          className={`shrink-0 ${isActive ? 'bg-accent border-accent-foreground/20' : ''}`}
        >
          {label}
          {isActive && <ChevronDownIcon className='ml-1 h-3 w-3' />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${contentWidth} ${scrollable ? 'max-h-64 overflow-y-auto' : ''}`} align='start'>
        <div className='space-y-2'>{children}</div>
      </PopoverContent>
    </Popover>
  )
}

type CheckboxItemProps = {
  id: string
  label: string
  checked: boolean
  onChange: () => void
  count?: number
  disabled?: boolean
  imageUrl?: string | null
}

function CheckboxItem({ id, label, checked, onChange, count, disabled, imageUrl }: CheckboxItemProps) {
  return (
    <div className='flex items-center space-x-2'>
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      {imageUrl && <img src={imageUrl} alt='' className='w-[18px] h-[18px] object-contain shrink-0' />}
      <Label htmlFor={id} className={`text-sm font-normal cursor-pointer ${disabled ? 'text-muted-foreground' : ''}`}>
        {label}
        {count !== undefined && count > 0 && <span className='ml-1 text-muted-foreground'>({count})</span>}
      </Label>
    </div>
  )
}
