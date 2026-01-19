import { query } from '../_generated/server'
import { v } from 'convex/values'

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
 * Get an author by ID with their book count.
 */
export const getWithBookCount = query({
  args: {
    authorId: v.id('authors'),
  },
  handler: async (context, args) => {
    const author = await context.db.get(args.authorId)
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
