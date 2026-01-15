import { query, internalQuery } from '../_generated/server'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

export const list = query({
  handler: async (context) => {
    const books = await context.db.query('books').order('desc').collect()

    // Resolve cover URLs for all books
    const booksWithUrls = await Promise.all(
      books.map(async (book) => {
        const coverUrl = book.coverStorageId ? await context.storage.getUrl(book.coverStorageId) : null

        return { ...book, coverUrl }
      }),
    )

    return booksWithUrls
  },
})

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (context, args) => {
    const paginatedResult = await context.db
      .query('books')
      .order('desc')
      .paginate(args.paginationOpts)

    const booksWithUrls = await Promise.all(
      paginatedResult.page.map(async (book) => {
        const coverUrl = book.coverStorageId ? await context.storage.getUrl(book.coverStorageId) : null

        return { ...book, coverUrl }
      }),
    )

    return {
      ...paginatedResult,
      page: booksWithUrls,
    }
  },
})

export const get = query({
  args: { id: v.id('books') },
  handler: async (context, args) => {
    const book = await context.db.get(args.id)
    if (!book) return null

    const coverUrl = book.coverStorageId ? await context.storage.getUrl(book.coverStorageId) : null

    return { ...book, coverUrl }
  },
})

// Internal query for use in actions (no URL resolution needed)
export const getInternal = internalQuery({
  args: { id: v.id('books') },
  handler: async (context, args) => {
    const book = await context.db.get(args.id)

    return book
  },
})

// Internal query to find a book by ASIN
export const findByAsin = internalQuery({
  args: { asin: v.string() },
  handler: async (context, args) => {
    const book = await context.db
      .query('books')
      .withIndex('by_asin', (q) => q.eq('asin', args.asin))
      .unique()

    return book
  },
})
