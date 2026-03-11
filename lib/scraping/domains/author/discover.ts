import type { AuthorData } from './types'
import type { Discovery } from '@/lib/scraping/types'

/**
 * Extract discoveries from parsed author data.
 * Returns links to books discovered from the author page.
 *
 * Author scrapes are a terminal expansion point for an explicit author
 * request. They should not fan back out into series scrapes.
 */
export function discoverAuthorLinks(data: AuthorData): Discovery[] {
  const discoveries: Discovery[] = []

  // Book discoveries
  // Keep all books found on the author page; queue mutation still applies a global cap.
  for (const book of data.books) {
    if (book.amazonUrl) {
      discoveries.push({
        type: 'book',
        url: book.amazonUrl,
        metadata: {
          name: book.title ?? undefined,
          imageUrl: book.coverImageUrl ?? undefined,
        },
        priority: 35,
        source: 'author-page',
      })
    }
  }

  return discoveries
}
