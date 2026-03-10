import { query, internalQuery } from '../_generated/server'
import { v } from 'convex/values'
import { Id, Doc } from '../_generated/dataModel'

/**
 * Resolve multiple image URLs from author's image storage IDs.
 * Returns thumb (36px), medium (150px), and large (400px) URLs.
 */
async function resolveImageUrls(
  storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> },
  author: Doc<'authors'>,
): Promise<{ imageUrl: string | null; imageUrlThumb: string | null; imageUrlLarge: string | null }> {
  const thumbId = author.image?.storageIdThumb
  const mediumId = author.image?.storageIdMedium
  const largeId = author.image?.storageIdLarge

  const imageUrl = mediumId ? await storage.getUrl(mediumId) : null
  const imageUrlThumb = thumbId ? await storage.getUrl(thumbId) : imageUrl
  const imageUrlLarge = largeId ? await storage.getUrl(largeId) : imageUrl

  return { imageUrl, imageUrlThumb, imageUrlLarge }
}

/**
 * Get an author by their Amazon author ID.
 */
export const getByAmazonId = query({
  args: {
    amazonAuthorId: v.string(),
  },
  handler: async (context, args) => {
    return await context.db
      .query('authors')
      .withIndex('by_amazonAuthorId', (q) => q.eq('amazonAuthorId', args.amazonAuthorId))
      .unique()
  },
})

/**
 * Get an author by name.
 */
export const getByName = query({
  args: {
    name: v.string(),
  },
  handler: async (context, args) => {
    return await context.db
      .query('authors')
      .withIndex('by_name', (q) => q.eq('name', args.name))
      .first()
  },
})

/**
 * Get all books by an author (via bookAuthors join table).
 * This is the critical "all books by author X" query.
 */
export const getBooksByAuthor = query({
  args: {
    authorId: v.id('authors'),
  },
  handler: async (context, args) => {
    const links = await context.db
      .query('bookAuthors')
      .withIndex('by_authorId', (q) => q.eq('authorId', args.authorId))
      .collect()

    const books = await Promise.all(links.map((link) => context.db.get(link.bookId)))

    return books.filter(Boolean)
  },
})

/**
 * List all authors.
 */
export const list = query({
  args: {},
  handler: async (context) => {
    return await context.db.query('authors').order('desc').collect()
  },
})

/**
 * List all authors with their top 5 books (for authors page).
 * Sorted by book count (most books first).
 */
export const listWithTopBooks = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('authors'),
      slug: v.union(v.string(), v.null()),
      name: v.string(),
      imageUrlThumb: v.union(v.string(), v.null()),
      imageUrl: v.union(v.string(), v.null()),
      imageUrlLarge: v.union(v.string(), v.null()),
      books: v.array(
        v.object({
          _id: v.id('books'),
          slug: v.union(v.string(), v.null()),
          title: v.string(),
          coverUrl: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (context) => {
    const allAuthors = await context.db.query('authors').order('desc').collect()

    const authorsWithBooks = await Promise.all(
      allAuthors.map(async (author) => {
        const { imageUrl, imageUrlThumb, imageUrlLarge } = await resolveImageUrls(context.storage, author)

        // Get books by this author
        const bookLinks = await context.db
          .query('bookAuthors')
          .withIndex('by_authorId', (q) => q.eq('authorId', author._id))
          .collect()

        // Get book details with covers (limit to 5)
        const books = await Promise.all(
          bookLinks.slice(0, 5).map(async (link) => {
            const book = (await context.db.get(link.bookId)) as Doc<'books'> | null
            if (!book) return null

            const coverStorageId = book.cover?.storageIdMedium
            const coverUrl = coverStorageId ? await context.storage.getUrl(coverStorageId) : null

            return {
              _id: book._id,
              slug: book.slug,
              title: book.title,
              coverUrl,
            }
          }),
        )

        return {
          _id: author._id,
          slug: author.slug ?? null,
          name: author.name,
          imageUrlThumb,
          imageUrl,
          imageUrlLarge,
          books: books
            .filter((b): b is NonNullable<typeof b> => b !== null)
            .map((b) => ({
              ...b,
              slug: b.slug ?? null,
            })),
          bookCount: bookLinks.length,
        }
      }),
    )

    // Sort by book count (descending) - authors with most books first
    const sorted = authorsWithBooks.sort((a, b) => b.bookCount - a.bookCount)

    // Remove bookCount from returned objects (only used for sorting)
    return sorted.map(({ bookCount, ...author }) => author)
  },
})

/**
 * Get an author by ID with their book count.
 */
export const getWithBookCount = query({
  args: {
    authorId: v.id('authors'),
  },
  handler: async (context, args) => {
    const author = (await context.db.get(args.authorId)) as Doc<'authors'> | null
    if (!author) return null

    const bookLinks = await context.db
      .query('bookAuthors')
      .withIndex('by_authorId', (q) => q.eq('authorId', args.authorId))
      .collect()

    return {
      ...author,
      bookCount: bookLinks.length,
    }
  },
})

/**
 * Get an author by ID with image URL and books with cover URLs.
 */
export const getWithDetails = query({
  args: {
    authorId: v.id('authors'),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('authors'),
      name: v.string(),
      bio: v.union(v.string(), v.null()),
      imageUrl: v.union(v.string(), v.null()),
      sourceUrl: v.union(v.string(), v.null()),
      scrapeVersion: v.union(v.number(), v.null()),
      scrapeStatus: v.string(),
      badScrape: v.union(v.boolean(), v.null()),
      badScrapeNotes: v.union(v.string(), v.null()),
      bookCount: v.number(),
      books: v.array(
        v.object({
          _id: v.id('books'),
          title: v.string(),
          coverUrl: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (context, args) => {
    const author = (await context.db.get(args.authorId)) as Doc<'authors'> | null
    if (!author) return null

    const { imageUrl } = await resolveImageUrls(context.storage, author)

    const bookLinks = await context.db
      .query('bookAuthors')
      .withIndex('by_authorId', (q) => q.eq('authorId', args.authorId))
      .collect()

    const books = await Promise.all(
      bookLinks.map(async (link) => {
        const book = (await context.db.get(link.bookId)) as Doc<'books'> | null
        if (!book) return null

        const coverStorageId = book.cover?.storageIdMedium
        const coverUrl = coverStorageId ? await context.storage.getUrl(coverStorageId) : null

        return {
          _id: book._id,
          slug: book.slug,
          title: book.title,
          coverUrl,
        }
      }),
    )

    return {
      _id: author._id,
      name: author.name,
      bio: author.bio ?? null,
      imageUrl,
      sourceUrl: author.sourceUrl ?? null,
      scrapeVersion: author.scrapeVersion ?? null,
      scrapeStatus: author.scrapeStatus,
      badScrape: author.badScrape ?? null,
      badScrapeNotes: author.badScrapeNotes ?? null,
      bookCount: bookLinks.length,
      books: books.filter((b): b is NonNullable<typeof b> => b !== null),
    }
  },
})

/**
 * Get an author by slug with image URL and books with cover URLs.
 */
export const getBySlug = query({
  args: {
    slug: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('authors'),
      name: v.string(),
      bio: v.union(v.string(), v.null()),
      imageUrl: v.union(v.string(), v.null()),
      sourceUrl: v.union(v.string(), v.null()),
      scrapeVersion: v.union(v.number(), v.null()),
      scrapeStatus: v.string(),
      badScrape: v.union(v.boolean(), v.null()),
      badScrapeNotes: v.union(v.string(), v.null()),
      bookCount: v.number(),
      books: v.array(
        v.object({
          _id: v.id('books'),
          title: v.string(),
          coverUrl: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (context, args) => {
    const author = await context.db
      .query('authors')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!author) return null

    const { imageUrl } = await resolveImageUrls(context.storage, author)

    const bookLinks = await context.db
      .query('bookAuthors')
      .withIndex('by_authorId', (q) => q.eq('authorId', author._id))
      .collect()

    const books = await Promise.all(
      bookLinks.map(async (link) => {
        const book = (await context.db.get(link.bookId)) as Doc<'books'> | null
        if (!book) return null

        const coverStorageId = book.cover?.storageIdMedium
        const coverUrl = coverStorageId ? await context.storage.getUrl(coverStorageId) : null

        return {
          _id: book._id,
          slug: book.slug,
          title: book.title,
          coverUrl,
        }
      }),
    )

    return {
      _id: author._id,
      name: author.name,
      bio: author.bio ?? null,
      imageUrl,
      sourceUrl: author.sourceUrl ?? null,
      scrapeVersion: author.scrapeVersion ?? null,
      scrapeStatus: author.scrapeStatus,
      badScrape: author.badScrape ?? null,
      badScrapeNotes: author.badScrapeNotes ?? null,
      bookCount: bookLinks.length,
      books: books.filter((b): b is NonNullable<typeof b> => b !== null),
    }
  },
})

export const getBySlugOrId = query({
  args: { slugOrId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('authors'),
      name: v.string(),
      bio: v.union(v.string(), v.null()),
      imageUrlThumb: v.union(v.string(), v.null()),
      imageUrl: v.union(v.string(), v.null()),
      imageUrlLarge: v.union(v.string(), v.null()),
      sourceUrl: v.union(v.string(), v.null()),
      scrapeVersion: v.union(v.number(), v.null()),
      scrapeStatus: v.string(),
      badScrape: v.union(v.boolean(), v.null()),
      badScrapeNotes: v.union(v.string(), v.null()),
      bookCount: v.number(),
      books: v.array(
        v.object({
          _id: v.id('books'),
          slug: v.union(v.string(), v.null()),
          title: v.string(),
          coverUrl: v.union(v.string(), v.null()),
          seriesPosition: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (context, args) => {
    // Try slug first
    const bySlug = await context.db
      .query('authors')
      .withIndex('by_slug', (q) => q.eq('slug', args.slugOrId))
      .first()
    if (bySlug) {
      const { imageUrl, imageUrlThumb, imageUrlLarge } = await resolveImageUrls(context.storage, bySlug)
      const bookLinks = await context.db
        .query('bookAuthors')
        .withIndex('by_authorId', (q) => q.eq('authorId', bySlug._id))
        .collect()
      const books = await Promise.all(
        bookLinks.map(async (link) => {
          const book = (await context.db.get(link.bookId)) as Doc<'books'> | null
          if (!book) return null
          const coverStorageId = book.cover?.storageIdMedium
          const coverUrl = coverStorageId ? await context.storage.getUrl(coverStorageId) : null
          return {
            _id: book._id,
            slug: book.slug ?? null,
            title: book.title,
            coverUrl,
            seriesPosition: book.seriesPosition ?? null,
          }
        }),
      )
      return {
        _id: bySlug._id,
        name: bySlug.name,
        bio: bySlug.bio ?? null,
        imageUrlThumb,
        imageUrl,
        imageUrlLarge,
        sourceUrl: bySlug.sourceUrl ?? null,
        scrapeVersion: bySlug.scrapeVersion ?? null,
        scrapeStatus: bySlug.scrapeStatus,
        badScrape: bySlug.badScrape ?? null,
        badScrapeNotes: bySlug.badScrapeNotes ?? null,
        bookCount: bookLinks.length,
        books: books.filter((b): b is NonNullable<typeof b> => b !== null),
      }
    }

    // Fall back to id lookup
    try {
      const byId = (await context.db.get(args.slugOrId as Id<'authors'>)) as Doc<'authors'> | null
      if (byId) {
        const { imageUrl, imageUrlThumb, imageUrlLarge } = await resolveImageUrls(context.storage, byId)
        const bookLinks = await context.db
          .query('bookAuthors')
          .withIndex('by_authorId', (q) => q.eq('authorId', byId._id))
          .collect()
        const books = await Promise.all(
          bookLinks.map(async (link) => {
            const book = (await context.db.get(link.bookId)) as Doc<'books'> | null
            if (!book) return null
            const coverStorageId = book.cover?.storageIdMedium
            const coverUrl = coverStorageId ? await context.storage.getUrl(coverStorageId) : null
            return {
              _id: book._id,
              slug: book.slug ?? null,
              title: book.title,
              coverUrl,
              seriesPosition: book.seriesPosition ?? null,
            }
          }),
        )
        return {
          _id: byId._id,
          name: byId.name,
          bio: byId.bio ?? null,
          imageUrlThumb,
          imageUrl,
          imageUrlLarge,
          sourceUrl: byId.sourceUrl ?? null,
          scrapeVersion: byId.scrapeVersion ?? null,
          scrapeStatus: byId.scrapeStatus,
          badScrape: byId.badScrape ?? null,
          badScrapeNotes: byId.badScrapeNotes ?? null,
          bookCount: bookLinks.length,
          books: books.filter((b): b is NonNullable<typeof b> => b !== null),
        }
      }
    } catch {
      // Invalid id format, return null
    }

    return null
  },
})

/**
 * Internal query for use in actions (no URL resolution needed).
 */
export const getInternal = internalQuery({
  args: { authorId: v.id('authors') },
  handler: async (context, args) => context.db.get(args.authorId),
})

/**
 * List authors that have image source URL but no image stored (for backfill).
 */
export const listMissingAvatars = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('authors'),
      imageSourceUrl: v.string(),
    }),
  ),
  handler: async (context, args) => {
    const limit = args.limit ?? 50
    const allAuthors = await context.db.query('authors').collect()

    const missingAvatars = allAuthors
      .filter((author) => author.image?.sourceImageUrl && !author.image?.storageIdMedium)
      .slice(0, limit)
      .map((author) => ({
        _id: author._id,
        imageSourceUrl: author.image!.sourceImageUrl!,
      }))

    return missingAvatars
  },
})

/**
 * List authors with outdated scrape versions (for automatic re-scraping).
 * Returns authors that have sourceUrl and scrapeVersion < currentVersion.
 */
export const listOutdatedVersions = query({
  args: {
    currentVersion: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('authors'),
      name: v.string(),
      sourceUrl: v.string(),
      scrapeVersion: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (context, args) => {
    const limit = args.limit ?? 10

    const allAuthors = await context.db.query('authors').collect()

    return allAuthors
      .filter((a) => {
        // Must have a URL to scrape
        if (!a.sourceUrl) return false
        // Include if no version (never scraped) or version is outdated
        return a.scrapeVersion === undefined || a.scrapeVersion < args.currentVersion
      })
      .slice(0, limit)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        sourceUrl: a.sourceUrl!,
        scrapeVersion: a.scrapeVersion ?? null,
      }))
  },
})
