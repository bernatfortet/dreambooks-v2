export type SeriesData = {
  name: string | null
  description: string | null
  totalBooks: number | null
  coverImageUrl: string | null
  asin: string | null
  books: SeriesBookEntry[]
}

export type SeriesBookEntry = {
  title: string | null
  asin: string | null
  position: number | null
  coverImageUrl: string | null
}
