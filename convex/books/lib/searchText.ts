/**
 * Build searchText field for full-text search.
 * Combines title + subtitle + authors + identifiers for better search quality.
 * Note: ISBNs are not included here as they exist only on editions.
 */
export function buildSearchText(book: { title: string; subtitle?: string; authors: string[]; asin?: string }): string {
  return [book.title, book.subtitle, ...book.authors, book.asin].filter(Boolean).join(' ')
}
