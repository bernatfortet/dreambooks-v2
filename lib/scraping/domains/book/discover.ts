import type { BookData } from './types'
import type { Discovery } from '@/lib/scraping/types'
import { buildAuthorUrl } from '@/lib/scraping/utils/amazon-url'
import { toSlug } from '@/lib/scraping/utils/slug'

/**
 * Extract discoveries from parsed book data.
 * Returns links to series and authors discovered from the book page.
 */
export function discoverBookLinks(data: BookData): Discovery[] {
  const discoveries: Discovery[] = []

  // Series discovery
  if (data.seriesUrl && data.seriesName) {
    discoveries.push({
      type: 'series',
      url: data.seriesUrl,
      metadata: { name: data.seriesName },
      priority: 20,
      source: 'book-series-link',
    })
  }

  // Author discoveries from amazonAuthorIds
  // Names and IDs should be in the same order from extraction
  const authorIds = data.amazonAuthorIds ?? []
  const authorNames = data.authors ?? []

  for (let i = 0; i < authorIds.length; i++) {
    const authorId = authorIds[i]
    const authorName = authorNames[i] // May be undefined if arrays don't match

    // Build URL with slug from author name if available
    const slug = authorName ? toSlug(authorName) : null

    discoveries.push({
      type: 'author',
      url: buildAuthorUrl(authorId, slug),
      metadata: authorName ? { name: authorName } : undefined,
      priority: 40,
      source: 'book-author-link',
    })
  }

  return discoveries
}
