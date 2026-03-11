type BookCoverFields = {
  _id?: string | null
  coverUrl?: string | null
  coverUrlThumb?: string | null
  coverUrlFull?: string | null
  coverWidth?: number | null
  coverHeight?: number | null
  cover?: {
    url?: string | null
    urlThumb?: string | null
    urlFull?: string | null
    width?: number | null
    height?: number | null
  } | null
}

export function getBookCoverUrl(book: BookCoverFields) {
  const coverUrl = book.coverUrl ?? book.cover?.url ?? null
  return coverUrl
}

export function getBookCoverUrlThumb(book: BookCoverFields) {
  const coverUrlThumb = book.coverUrlThumb ?? book.cover?.urlThumb ?? getBookCoverUrl(book)
  return coverUrlThumb
}

export function getBookCoverUrlFull(book: BookCoverFields) {
  const coverUrlFull = book.coverUrlFull ?? book.cover?.urlFull ?? getBookCoverUrl(book)
  return coverUrlFull
}

export function getBookCoverDimensions(book: BookCoverFields) {
  const width = book.coverWidth ?? book.cover?.width ?? null
  const height = book.coverHeight ?? book.cover?.height ?? null

  return { width, height }
}

export function getBookCoverKey(book: BookCoverFields) {
  return [book._id ?? '', getBookCoverUrl(book) ?? '', getBookCoverUrlFull(book) ?? '', book.cover?.width ?? book.coverWidth ?? '', book.cover?.height ?? book.coverHeight ?? ''].join(':')
}
