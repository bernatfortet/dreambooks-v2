import { query } from '../_generated/server'
import { v } from 'convex/values'
import { isBookVisibleForDiscovery } from '../lib/bookVisibility'

const SEARCH_OVERFETCH_MULTIPLIER = 3

export const global = query({
  args: {
    query: v.string(),
    limitPerType: v.optional(v.number()),
  },
  returns: v.object({
    books: v.array(
      v.object({
        _id: v.id('books'),
        title: v.string(),
        slug: v.union(v.string(), v.null()),
        authors: v.array(v.string()),
        coverUrl: v.union(v.string(), v.null()),
        coverWidth: v.number(),
        coverHeight: v.number(),
        blurHash: v.union(v.string(), v.null()),
        seriesPosition: v.union(v.number(), v.null()),
      }),
    ),
    series: v.array(
      v.object({
        _id: v.id('series'),
        name: v.string(),
        slug: v.union(v.string(), v.null()),
        coverUrl: v.union(v.string(), v.null()),
      }),
    ),
    authors: v.array(
      v.object({
        _id: v.id('authors'),
        name: v.string(),
        slug: v.union(v.string(), v.null()),
      }),
    ),
    exactMatch: v.union(
      v.object({
        type: v.literal('book'),
        id: v.id('books'),
        title: v.string(),
        slug: v.union(v.string(), v.null()),
      }),
      v.object({
        type: v.literal('series'),
        id: v.id('series'),
        name: v.string(),
        slug: v.union(v.string(), v.null()),
      }),
      v.object({
        type: v.literal('author'),
        id: v.id('authors'),
        name: v.string(),
        slug: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
  }),
  handler: async (context, args) => {
    const limit = args.limitPerType ?? 5
    const searchLimit = limit * SEARCH_OVERFETCH_MULTIPLIER
    const trimmed = args.query.trim()
    if (!trimmed) {
      return { books: [], series: [], authors: [], exactMatch: null }
    }

    const queryLower = trimmed.toLowerCase()

    // Search all 3 tables in parallel
    const [rawBooks, rawSeries, rawAuthors] = await Promise.all([
      context.db
        .query('books')
        .withSearchIndex('search_text', (q) => q.search('searchText', trimmed))
        .take(searchLimit),
      context.db
        .query('series')
        .withSearchIndex('search_name', (q) => q.search('name', trimmed))
        .take(searchLimit),
      context.db
        .query('authors')
        .withSearchIndex('search_name', (q) => q.search('name', trimmed))
        .take(searchLimit),
    ])

    const visibleBooks = rawBooks.filter((book) => isBookVisibleForDiscovery(book)).slice(0, limit)

    // Determine exact match (case-insensitive, priority: Book > Series > Author)
    let exactMatch:
      | {
          type: 'book'
          id: any
          title: string
          slug: string | null
        }
      | {
          type: 'series'
          id: any
          name: string
          slug: string | null
        }
      | {
          type: 'author'
          id: any
          name: string
          slug: string | null
        }
      | null = null

    const exactBook = visibleBooks.find((b) => b.title.toLowerCase() === queryLower)
    const exactSeries = rawSeries.slice(0, limit).find((s) => s.name.toLowerCase() === queryLower)
    const exactAuthor = rawAuthors.slice(0, limit).find((a) => a.name.toLowerCase() === queryLower)

    if (exactBook) {
      exactMatch = {
        type: 'book',
        id: exactBook._id,
        title: exactBook.title,
        slug: exactBook.slug ?? null,
      }
    } else if (exactSeries) {
      exactMatch = {
        type: 'series',
        id: exactSeries._id,
        name: exactSeries.name,
        slug: exactSeries.slug ?? null,
      }
    } else if (exactAuthor) {
      exactMatch = {
        type: 'author',
        id: exactAuthor._id,
        name: exactAuthor.name,
        slug: exactAuthor.slug ?? null,
      }
    }

    // Resolve cover URLs for books and series
    const books = await Promise.all(
      visibleBooks.map(async (book) => {
        const coverStorageId = book.cover?.storageIdMedium
        const coverUrl = coverStorageId ? await context.storage.getUrl(coverStorageId) : null
        const coverWidth = book.cover?.width ?? 200
        const coverHeight = book.cover?.height ?? 300

        return {
          _id: book._id,
          title: book.title,
          slug: book.slug ?? null,
          authors: book.authors ?? [],
          coverUrl,
          coverWidth,
          coverHeight,
          blurHash: book.cover?.blurHash ?? null,
          seriesPosition: book.seriesPosition ?? null,
        }
      }),
    )

    const series = await Promise.all(
      rawSeries.slice(0, limit).map(async (s) => ({
        _id: s._id,
        name: s.name,
        slug: s.slug ?? null,
        coverUrl: s.coverStorageId ? await context.storage.getUrl(s.coverStorageId) : null,
      })),
    )

    const authors = rawAuthors.slice(0, limit).map((a) => ({ _id: a._id, name: a.name, slug: a.slug ?? null }))

    return { books, series, authors, exactMatch }
  },
})
