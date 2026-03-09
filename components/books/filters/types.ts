import type { Id } from '@/convex/_generated/dataModel'

export type BookFilters = {
  search?: string
  seriesId?: string
  authorId?: string
  coverStatus?: string
  detailsStatus?: string
  ageRangeBuckets?: string[]
  gradeLevelBuckets?: string[]
  awardIds?: Id<'awards'>[]
  seriesFilter?: 'all' | 'in-series' | 'standalone'
}
