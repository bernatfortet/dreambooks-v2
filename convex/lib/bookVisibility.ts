import type { Doc } from '../_generated/dataModel'

type BookVisibilityFields = Pick<Doc<'books'>, 'catalogStatus'>

export function isBookHidden(book: BookVisibilityFields): boolean {
  return book.catalogStatus === 'hidden'
}

export function isBookVisibleForDiscovery(book: BookVisibilityFields): boolean {
  return !isBookHidden(book)
}
