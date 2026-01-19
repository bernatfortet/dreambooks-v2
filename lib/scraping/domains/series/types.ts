export type SeriesPagination = {
  currentPage: number
  totalPages: number | null
  nextPageUrl: string | null
}

export type SeriesData = {
  name: string | null
  description: string | null
  totalBooks: number | null
  coverImageUrl: string | null
  asin: string | null
  books: SeriesBookEntry[]
  pagination: SeriesPagination | null
}

export type BookFormat = 'hardcover' | 'paperback' | 'kindle' | 'audiobook' | 'unknown'

export type AuthorLink = {
  name: string
  url: string
}

export type SeriesBookEntry = {
  title: string | null
  asin: string | null
  amazonUrl: string | null
  position: number | null
  coverImageUrl: string | null
  format: BookFormat
  authors: string[]
  authorLinks: AuthorLink[] // Amazon author profile URLs with names
}
