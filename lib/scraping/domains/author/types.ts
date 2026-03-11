export type AuthorData = {
  name: string | null
  bio: string | null
  imageUrl: string | null
  amazonAuthorId: string | null
  instagramHandle: string | null
  instagramUrl: string | null
  series: AuthorSeriesEntry[]
  books: AuthorBookEntry[]
}

export type AuthorSeriesEntry = {
  name: string | null
  amazonUrl: string | null
  bookCount: number | null
}

export type AuthorBookEntry = {
  title: string | null
  asin: string | null
  amazonUrl: string | null
  coverImageUrl: string | null
}
