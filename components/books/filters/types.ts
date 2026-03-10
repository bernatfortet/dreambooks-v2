export type BookFilters = {
  ageRangeBuckets?: string[] // Bucket IDs like '0-3', '4-8', '9-12', '13+'
  gradeLevelBuckets?: string[] // Bucket IDs like 'prek', 'k-2', '3-5', '6-8', '9-12'
  awardIds?: string[]
  seriesFilter?: 'all' | 'with-series' | 'standalone'
}
