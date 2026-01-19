import { query } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Get all authors for a book.
 */
export const getAuthorsByBook = query({
  args: {
    bookId: v.id('books'),
  },
  handler: async (context, args) => {
    const links = await context.db
      .query('bookAuthors')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    const authors = await Promise.all(links.map((link) => context.db.get(link.authorId)))

    return authors.filter(Boolean)
  },
})

/**
 * Get all book-author links for an author.
 */
export const getLinksByAuthor = query({
  args: {
    authorId: v.id('authors'),
  },
  handler: async (context, args) => {
    return await context.db
      .query('bookAuthors')
      .withIndex('by_authorId', (q) => q.eq('authorId', args.authorId))
      .collect()
  },
})

/**
 * Check if a book-author link exists.
 */
export const linkExists = query({
  args: {
    bookId: v.id('books'),
    authorId: v.id('authors'),
  },
  handler: async (context, args) => {
    const link = await context.db
      .query('bookAuthors')
      .withIndex('by_bookId_authorId', (q) =>
        q.eq('bookId', args.bookId).eq('authorId', args.authorId)
      )
      .unique()

    return !!link
  },
})
