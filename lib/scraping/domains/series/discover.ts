import type { SeriesData } from './types'
import type { Discovery } from '@/lib/scraping/types'

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
    if (!isAllowedSeriesDiscoveredBookUrl(book.amazonUrl)) return false
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
        imageUrl: book.coverImageUrl ?? undefined,
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

function isAllowedSeriesDiscoveredBookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)

    // Hard block known "similar items" widgets that leak unrelated books.
    if (parsed.pathname.includes('/ref=mes-dp')) return false

    // Only accept canonical product URL shapes.
    const isProduct = /\/dp\/[A-Z0-9]{10}/i.test(parsed.pathname) || /\/gp\/product\/[A-Z0-9]{10}/i.test(parsed.pathname)
    if (!isProduct) return false

    return true
  } catch {
    // If it's not parseable, be conservative and skip.
    return false
  }
}
