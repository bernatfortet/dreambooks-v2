export type AuthorData = {
  name: string | null
  bio: string | null
  imageUrl: string | null
  amazonAuthorId: string | null
  books: AuthorBookEntry[]
}

export type AuthorBookEntry = {
  title: string | null
  asin: string | null
  coverImageUrl: string | null
}
