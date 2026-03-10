import { query } from '../_generated/server'
import { v } from 'convex/values'

/**
 * List all awards for display.
 */
export const list = query({
  returns: v.array(
    v.object({
      _id: v.id('awards'),
      name: v.string(),
      description: v.optional(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (context) => {
    const allAwards = await context.db.query('awards').order('desc').collect()

    const awardsWithUrls = await Promise.all(
      allAwards.map(async (award) => {
        // Use imageSourceUrl if available, otherwise try to get from storage
        let imageUrl: string | null = award.imageSourceUrl ?? null

        if (!imageUrl && award.imageStorageId) {
          imageUrl = await context.storage.getUrl(award.imageStorageId)
        }

        return {
          _id: award._id,
          name: award.name,
          description: award.description,
          imageUrl,
          createdAt: award.createdAt,
        }
      }),
    )

    return awardsWithUrls
  },
})

/**
 * Get a single award by ID.
 */
export const get = query({
  args: { id: v.id('awards') },
  returns: v.union(
    v.object({
      _id: v.id('awards'),
      name: v.string(),
      description: v.optional(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (context, args) => {
    const award = await context.db.get(args.id)
    if (!award) return null

    // Use imageSourceUrl if available, otherwise try to get from storage
    let imageUrl: string | null = award.imageSourceUrl ?? null

    if (!imageUrl && award.imageStorageId) {
      imageUrl = await context.storage.getUrl(award.imageStorageId)
    }

    return {
      _id: award._id,
      name: award.name,
      description: award.description,
      imageUrl,
      createdAt: award.createdAt,
    }
  },
})

/**
 * Get a single award by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      _id: v.id('awards'),
      name: v.string(),
      description: v.optional(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (context, args) => {
    const award = await context.db
      .query('awards')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!award) return null

    // Use imageSourceUrl if available, otherwise try to get from storage
    let imageUrl: string | null = award.imageSourceUrl ?? null

    if (!imageUrl && award.imageStorageId) {
      imageUrl = await context.storage.getUrl(award.imageStorageId)
    }

    return {
      _id: award._id,
      name: award.name,
      description: award.description,
      imageUrl,
      createdAt: award.createdAt,
    }
  },
})

/**
 * Get an award with its books (user-facing).
 */
export const getWithBooks = query({
  args: { id: v.id('awards') },
  returns: v.union(
    v.object({
      _id: v.id('awards'),
      name: v.string(),
      description: v.optional(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      createdAt: v.number(),
      books: v.array(
        v.object({
          _id: v.id('books'),
          title: v.string(),
          authors: v.array(v.string()),
          cover: v.object({ url: v.union(v.string(), v.null()) }),
          year: v.optional(v.number()),
          category: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (context, args) => {
    const award = await context.db.get(args.id)
    if (!award) return null

    // Use imageSourceUrl if available, otherwise try to get from storage
    let imageUrl: string | null = award.imageSourceUrl ?? null

    if (!imageUrl && award.imageStorageId) {
      imageUrl = await context.storage.getUrl(award.imageStorageId)
    }

    // Get books via bookAwards join table
    const bookAwardLinks = await context.db
      .query('bookAwards')
      .withIndex('by_awardId', (q) => q.eq('awardId', args.id))
      .collect()

    const booksWithAwardInfo = await Promise.all(
      bookAwardLinks.map(async (link) => {
        const book = await context.db.get(link.bookId)
        if (!book) return null

        const bookCoverUrl = book.cover?.storageIdMedium ? await context.storage.getUrl(book.cover.storageIdMedium) : null

        return {
          _id: book._id,
          slug: book.slug,
          title: book.title,
          authors: book.authors,
          cover: { url: bookCoverUrl },
          year: link.year,
          category: link.category,
        }
      }),
    )

    // Filter out nulls and sort by year (most recent first), then by category
    const books = booksWithAwardInfo
      .filter((book): book is NonNullable<typeof book> => book !== null)
      .sort((a, b) => {
        // Sort by year (descending), then by category
        if (a.year && b.year && a.year !== b.year) {
          return b.year - a.year
        }
        // If years are equal or one is missing, sort by category (Winner first)
        const categoryOrder = { Winner: 0, 'Honor Book': 1, Finalist: 2 }
        const aOrder = a.category ? (categoryOrder[a.category as keyof typeof categoryOrder] ?? 99) : 99
        const bOrder = b.category ? (categoryOrder[b.category as keyof typeof categoryOrder] ?? 99) : 99
        return aOrder - bOrder
      })

    return {
      _id: award._id,
      name: award.name,
      description: award.description,
      imageUrl,
      createdAt: award.createdAt,
      books,
    }
  },
})

/**
 * Get an award with its books by slug (user-facing).
 */
export const getWithBooksBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      _id: v.id('awards'),
      name: v.string(),
      description: v.optional(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      createdAt: v.number(),
      books: v.array(
        v.object({
          _id: v.id('books'),
          slug: v.union(v.string(), v.null()),
          title: v.string(),
          authors: v.array(v.string()),
          cover: v.object({ url: v.union(v.string(), v.null()) }),
          year: v.optional(v.number()),
          category: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (context, args) => {
    const award = await context.db
      .query('awards')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!award) return null

    // Use imageSourceUrl if available, otherwise try to get from storage
    let imageUrl: string | null = award.imageSourceUrl ?? null

    if (!imageUrl && award.imageStorageId) {
      imageUrl = await context.storage.getUrl(award.imageStorageId)
    }

    // Get books via bookAwards join table
    const bookAwardLinks = await context.db
      .query('bookAwards')
      .withIndex('by_awardId', (q) => q.eq('awardId', award._id))
      .collect()

    const booksWithAwardInfo = await Promise.all(
      bookAwardLinks.map(async (link) => {
        const book = await context.db.get(link.bookId)
        if (!book) return null

        const bookCoverUrl = book.cover?.storageIdMedium ? await context.storage.getUrl(book.cover.storageIdMedium) : null

        return {
          _id: book._id,
          slug: book.slug ?? null,
          title: book.title,
          authors: book.authors,
          cover: { url: bookCoverUrl },
          year: link.year,
          category: link.category,
        }
      }),
    )

    // Filter out nulls and sort by year (most recent first), then by category
    const books = booksWithAwardInfo
      .filter((book): book is NonNullable<typeof book> => book !== null)
      .sort((a, b) => {
        // Sort by year (descending), then by category
        if (a.year && b.year && a.year !== b.year) {
          return b.year - a.year
        }
        // If years are equal or one is missing, sort by category (Winner first)
        const categoryOrder = { Winner: 0, 'Honor Book': 1, Finalist: 2 }
        const aOrder = a.category ? (categoryOrder[a.category as keyof typeof categoryOrder] ?? 99) : 99
        const bOrder = b.category ? (categoryOrder[b.category as keyof typeof categoryOrder] ?? 99) : 99
        return aOrder - bOrder
      })

    return {
      _id: award._id,
      name: award.name,
      description: award.description,
      imageUrl,
      createdAt: award.createdAt,
      books,
    }
  },
})
