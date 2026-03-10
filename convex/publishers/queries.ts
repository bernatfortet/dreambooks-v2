import { query } from '../_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { Id, Doc } from '../_generated/dataModel'

const publisherFields = v.object({
  _id: v.id('publishers'),
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  createdAt: v.number(),
})

async function resolveCoverUrl(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  book: Doc<'books'>,
): Promise<string | null> {
  const mediumId = book.cover?.storageIdMedium
  return mediumId ? await storage.getUrl(mediumId) : null
}

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
    const publisher = await context.db
      .query('publishers')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!publisher) return null

    // Count books via editions
    const editions = await context.db
      .query('bookEditions')
      .withIndex('by_publisherId', (q) => q.eq('publisherId', publisher._id))
      .collect()

    const uniqueBookIds = [...new Set(editions.map((e) => e.bookId))]

    return {
      _id: publisher._id,
      name: publisher.name,
      slug: publisher.slug ?? null,
      createdAt: publisher.createdAt,
      bookCount: uniqueBookIds.length,
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
        const editions = await context.db
          .query('bookEditions')
          .withIndex('by_publisherId', (q) => q.eq('publisherId', publisher._id))
          .collect()

        const uniqueBookIds = [...new Set(editions.map((e) => e.bookId))]
        const books = await Promise.all(uniqueBookIds.slice(0, 5).map((id) => context.db.get(id)))
        const validBooks = books.filter((book): book is NonNullable<typeof book> => book !== null)

        const booksWithCovers = await Promise.all(
          validBooks.map(async (book) => ({
            _id: book._id,
            title: book.title,
            slug: book.slug ?? null,
            coverUrl: await resolveCoverUrl(context.storage, book),
          })),
        )

        return {
          _id: publisher._id,
          name: publisher.name,
          slug: publisher.slug ?? null,
          bookCount: uniqueBookIds.length,
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
    const publisher = await context.db
      .query('publishers')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!publisher) return null

    const editions = await context.db
      .query('bookEditions')
      .withIndex('by_publisherId', (q) => q.eq('publisherId', publisher._id))
      .collect()

    const uniqueBookIds = [...new Set(editions.map((e) => e.bookId))]
    const books = await Promise.all(uniqueBookIds.map((id) => context.db.get(id)))
    const validBooks = books.filter((book): book is NonNullable<typeof book> => book !== null)

    const booksWithCovers = await Promise.all(
      validBooks.map(async (book) => ({
        _id: book._id,
        title: book.title,
        authors: book.authors,
        slug: book.slug ?? null,
        coverUrl: await resolveCoverUrl(context.storage, book),
        seriesPosition: book.seriesPosition ?? null,
      })),
    )

    return {
      _id: publisher._id,
      name: publisher.name,
      slug: publisher.slug ?? null,
      createdAt: publisher.createdAt,
      bookCount: uniqueBookIds.length,
      books: booksWithCovers,
    }
  },
})
