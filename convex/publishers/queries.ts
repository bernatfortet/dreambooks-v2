import { query } from '../_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import type { QueryCtx } from '../_generated/server'
import { Id, Doc } from '../_generated/dataModel'
import { isBookVisibleForDiscovery } from '../lib/bookVisibility'

const publisherFields = v.object({
  _id: v.id('publishers'),
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  createdAt: v.number(),
})

/**
 * List publishers with pagination.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(publisherFields),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (context, args) => {
    const result = await context.db.query('publishers').withIndex('by_name').paginate(args.paginationOpts)

    return {
      page: result.page.map((p) => ({
        _id: p._id,
        name: p.name,
        slug: p.slug ?? null,
        createdAt: p.createdAt,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})

/**
 * Get publisher by slug with book count.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('publishers'),
      name: v.string(),
      slug: v.union(v.string(), v.null()),
      createdAt: v.number(),
      bookCount: v.number(),
    }),
  ),
  handler: async (context, args) => {
    const publisher = await getPublisherBySlug(context, args.slug)
    if (!publisher) return null

    const visibleBooks = await getVisiblePublisherBooksByPublisherId(context, publisher._id)

    return {
      _id: publisher._id,
      name: publisher.name,
      slug: publisher.slug ?? null,
      createdAt: publisher.createdAt,
      bookCount: visibleBooks.length,
    }
  },
})

/**
 * List publishers with their top books (for list page).
 */
export const listWithTopBooks = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('publishers'),
      name: v.string(),
      slug: v.union(v.string(), v.null()),
      bookCount: v.number(),
      books: v.array(
        v.object({
          _id: v.id('books'),
          title: v.string(),
          slug: v.union(v.string(), v.null()),
          coverUrl: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (context) => {
    const publishers = await context.db.query('publishers').withIndex('by_name').collect()

    const results = await Promise.all(
      publishers.map(async (publisher) => {
        const visibleBooks = await getVisiblePublisherBooksByPublisherId(context, publisher._id)
        const booksWithCovers = await buildPublisherTopBooks(context.storage, visibleBooks)

        return {
          _id: publisher._id,
          name: publisher.name,
          slug: publisher.slug ?? null,
          bookCount: visibleBooks.length,
          books: booksWithCovers,
        }
      }),
    )

    return results
  },
})

/**
 * Get publisher by slug with all books (for detail page).
 */
export const getBySlugWithBooks = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('publishers'),
      name: v.string(),
      slug: v.union(v.string(), v.null()),
      createdAt: v.number(),
      bookCount: v.number(),
      books: v.array(
        v.object({
          _id: v.id('books'),
          title: v.string(),
          authors: v.array(v.string()),
          slug: v.union(v.string(), v.null()),
          coverUrl: v.union(v.string(), v.null()),
          seriesPosition: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (context, args) => {
    const publisher = await getPublisherBySlug(context, args.slug)
    if (!publisher) return null

    const visibleBooks = await getVisiblePublisherBooksByPublisherId(context, publisher._id)
    const booksWithCovers = await buildPublisherBooksWithCovers(context.storage, visibleBooks)

    return {
      _id: publisher._id,
      name: publisher.name,
      slug: publisher.slug ?? null,
      createdAt: publisher.createdAt,
      bookCount: visibleBooks.length,
      books: booksWithCovers,
    }
  },
})

async function getPublisherBySlug(
  context: QueryCtx,
  slug: string,
): Promise<Doc<'publishers'> | null> {
  return await context.db
    .query('publishers')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first()
}

async function getVisiblePublisherBooksByPublisherId(
  context: QueryCtx,
  publisherId: Id<'publishers'>,
): Promise<Doc<'books'>[]> {
  const bookIds = await getPublisherBookIds(context.db, publisherId)
  const books = await Promise.all(bookIds.map((bookId) => context.db.get(bookId)))

  return books.filter((book): book is NonNullable<typeof book> => book !== null && isBookVisibleForDiscovery(book))
}

async function getPublisherBookIds(
  db: QueryCtx['db'],
  publisherId: Id<'publishers'>,
): Promise<Id<'books'>[]> {
  const editions = await db
    .query('bookEditions')
    .withIndex('by_publisherId', (q) => q.eq('publisherId', publisherId))
    .collect()

  return [...new Set(editions.map((edition) => edition.bookId))]
}

async function buildPublisherTopBooks(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  books: Doc<'books'>[],
) {
  const topBooks = books.slice(0, 5)

  return await Promise.all(
    topBooks.map(async (book) => ({
      _id: book._id,
      title: book.title,
      slug: book.slug ?? null,
      coverUrl: await resolveCoverUrl(storage, book),
    })),
  )
}

async function buildPublisherBooksWithCovers(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  books: Doc<'books'>[],
) {
  return await Promise.all(
    books.map(async (book) => ({
      _id: book._id,
      title: book.title,
      authors: book.authors,
      slug: book.slug ?? null,
      coverUrl: await resolveCoverUrl(storage, book),
      seriesPosition: book.seriesPosition ?? null,
    })),
  )
}

async function resolveCoverUrl(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  book: Doc<'books'>,
): Promise<string | null> {
  const mediumId = book.cover?.storageIdMedium
  return mediumId ? await storage.getUrl(mediumId) : null
}
