import type { AuthorData } from './types'
import type { Discovery } from '@/lib/scraping/types'

/**
 * Extract discoveries from parsed author data.
 * Returns links to series and books discovered from the author page.
 */
export function discoverAuthorLinks(data: AuthorData): Discovery[] {
  const discoveries: Discovery[] = []

  // Series discoveries
  // Cap to prevent queue floods (max 20 series per author scrape)
  const cappedSeries = data.series.slice(0, 20)

  for (const series of cappedSeries) {
    if (series.amazonUrl) {
      discoveries.push({
        type: 'series',
        url: series.amazonUrl,
        metadata: { name: series.name ?? undefined },
        priority: 25,
        source: 'author-page',
      })
    }
  }

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
