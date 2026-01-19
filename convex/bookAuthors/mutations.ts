import { internalMutation, mutation } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Link books to an author by amazonAuthorId (primary) or name (fallback).
 * Called after upserting an author to backfill book-author relationships.
 */
export const linkByAmazonAuthorId = internalMutation({
  args: {
    authorId: v.id('authors'),
    amazonAuthorId: v.string(),
    authorName: v.string(),
  },
  returns: v.number(),
  handler: async (context, args) => {
    let linkedCount = 0

    // Get all books - we need to scan for matching amazonAuthorIds or author names
    const allBooks = await context.db.query('books').collect()

    for (const book of allBooks) {
      const hasAmazonId = book.amazonAuthorIds?.includes(args.amazonAuthorId)
      const hasNameMatch = book.authors.some(
        (a) => a.toLowerCase() === args.authorName.toLowerCase()
      )

      if (hasAmazonId || hasNameMatch) {
        // Check if link already exists
        const existing = await context.db
          .query('bookAuthors')
          .withIndex('by_bookId_authorId', (q) =>
            q.eq('bookId', book._id).eq('authorId', args.authorId)
          )
          .unique()

        if (!existing) {
          await context.db.insert('bookAuthors', {
            bookId: book._id,
            authorId: args.authorId,
            source: hasAmazonId ? 'amazonAuthorId' : 'nameMatch',
            createdAt: Date.now(),
          })
          linkedCount++

          console.log(`   📚 Linked book "${book.title}" to author (${hasAmazonId ? 'amazonAuthorId' : 'nameMatch'})`)
        }
      }
    }

    console.log(`✅ Linked ${linkedCount} books to author`)
    return linkedCount
  },
})

/**
 * Link a single book to an author.
 * Used when importing a book to link it to existing authors.
 */
export const linkBookToAuthor = internalMutation({
  args: {
    bookId: v.id('books'),
    authorId: v.id('authors'),
    source: v.string(), // 'amazonAuthorId' | 'nameMatch'
  },
  returns: v.boolean(),
  handler: async (context, args) => {
    // Check if link already exists
    const existing = await context.db
      .query('bookAuthors')
      .withIndex('by_bookId_authorId', (q) =>
        q.eq('bookId', args.bookId).eq('authorId', args.authorId)
      )
      .unique()

    if (existing) {
      return false
    }

    await context.db.insert('bookAuthors', {
      bookId: args.bookId,
      authorId: args.authorId,
      source: args.source,
      createdAt: Date.now(),
    })

    return true
  },
})

/**
 * Remove a book-author link.
 */
export const unlinkBookFromAuthor = mutation({
  args: {
    bookId: v.id('books'),
    authorId: v.id('authors'),
  },
  returns: v.boolean(),
  handler: async (context, args) => {
    const link = await context.db
      .query('bookAuthors')
      .withIndex('by_bookId_authorId', (q) =>
        q.eq('bookId', args.bookId).eq('authorId', args.authorId)
      )
      .unique()

    if (link) {
      await context.db.delete(link._id)
      return true
    }

    return false
  },
})
