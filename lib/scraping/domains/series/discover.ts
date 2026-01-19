import type { SeriesData } from './types'
import type { Discovery } from '../../types'

/**
 * Extract discoveries from parsed series data.
 * Returns links to books and authors discovered from the series page.
 */
export function discoverSeriesLinks(data: SeriesData): Discovery[] {
  const discoveries: Discovery[] = []

  // Book discoveries from series listing
  // Filter out audiobooks and books without URLs
  const booksToQueue = data.books.filter((book) => {
    if (book.format === 'audiobook') return false
    if (!book.amazonUrl) return false
    return true
  })

  // Cap discoveries to prevent queue floods (max 50 per series scrape)
  const cappedBooks = booksToQueue.slice(0, 50)

  for (const book of cappedBooks) {
    discoveries.push({
      type: 'book',
      url: book.amazonUrl!,
      metadata: {
        name: book.title ?? undefined,
        position: book.position ?? undefined,
      },
      priority: 30,
      source: 'series-listing',
    })
  }

  // Author discoveries from series listing
  // Collect unique author links from all books
  const seenAuthorUrls = new Set<string>()
  for (const book of data.books) {
    for (const authorLink of book.authorLinks) {
      if (!seenAuthorUrls.has(authorLink.url)) {
        seenAuthorUrls.add(authorLink.url)
        discoveries.push({
          type: 'author',
          url: authorLink.url,
          metadata: {
            name: authorLink.name,
          },
          priority: 40, // Lower priority than books
          source: 'series-listing',
        })
      }
    }
  }

  return discoveries
}
