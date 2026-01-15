export type ScrapedSeriesData = {
  seriesName: string
  description?: string
  coverImageUrl?: string
  expectedBookCount?: number
  books: Array<{
    title: string
    amazonUrl: string
    asin?: string
    position?: number
  }>
  pagination?: {
    currentPage: number
    totalPages: number
    nextPageUrl?: string
  }
}
