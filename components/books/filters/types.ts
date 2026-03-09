import type { Id } from '@/convex/_generated/dataModel'

export type SeriesFilter = 'all' | 'with-series' | 'standalone'

export type BookFilters = {
  ageRangeBuckets?: string[]
  gradeLevelBuckets?: string[]
  awardIds?: Id<'awards'>[]
  seriesFilter?: SeriesFilter
}
