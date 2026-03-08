import type { Id } from '@/convex/_generated/dataModel'

export type BookFilters = {
  ageRangeBuckets?: string[]
  gradeLevelBuckets?: string[]
  awardIds?: Id<'awards'>[]
  seriesFilter?: 'all' | 'in-series' | 'standalone'
}
