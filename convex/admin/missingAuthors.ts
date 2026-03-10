import { query } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Get summary of missing authors in the database.
 * Identifies books with amazonAuthorIds that don't have corresponding author records.
 */
export const summary = query({
  args: {},
  returns: v.object({
    totalBooks: v.number(),
    booksWithAuthorIds: v.number(),
    booksWithoutAuthorIds: v.number(),
    uniqueAuthorIdsFound: v.number(),
    authorsInDatabase: v.number(),
    missingAuthorIds: v.number(),
  }),
  handler: async (context) => {
    const books = await context.db.query('books').collect()
    const authors = await context.db.query('authors').collect()

    // Collect all unique author IDs from books
    const authorIdsFromBooks = new Set<string>()
    let booksWithAuthorIds = 0
    let booksWithoutAuthorIds = 0

    for (const book of books) {
      if (book.amazonAuthorIds && book.amazonAuthorIds.length > 0) {
        booksWithAuthorIds++
        for (const authorId of book.amazonAuthorIds) {
          authorIdsFromBooks.add(authorId)
        }
      } else {
        booksWithoutAuthorIds++
      }
    }

    // Get set of existing author IDs
    const existingAuthorIds = new Set(authors.map((a) => a.amazonAuthorId))

    // Find missing author IDs
    const missingAuthorIds = Array.from(authorIdsFromBooks).filter((id) => !existingAuthorIds.has(id))

    return {
      totalBooks: books.length,
      booksWithAuthorIds,
      booksWithoutAuthorIds,
      uniqueAuthorIdsFound: authorIdsFromBooks.size,
      authorsInDatabase: authors.length,
      missingAuthorIds: missingAuthorIds.length,
    }
  },
})

/**
 * Get list of missing author IDs with sample book info for building URLs.
 * Returns author IDs that exist in books but not in the authors table.
 * Also returns summary statistics to avoid duplicate table scans.
 */
export const getMissingAuthorIds = query({
  args: {},
  returns: v.object({
    summary: v.object({
      totalBooks: v.number(),
      booksWithAuthorIds: v.number(),
      booksWithoutAuthorIds: v.number(),
      uniqueAuthorIdsFound: v.number(),
      authorsInDatabase: v.number(),
      missingAuthorIds: v.number(),
    }),
    missingAuthors: v.array(
      v.object({
        authorId: v.string(),
        sampleBookTitle: v.string(),
        authorName: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (context) => {
    const books = await context.db.query('books').collect()
    const authors = await context.db.query('authors').collect()

    // Collect all unique author IDs from books
    const authorIdsFromBooks = new Set<string>()
    let booksWithAuthorIds = 0
    let booksWithoutAuthorIds = 0

    // Build map of author ID -> sample book info
    const authorIdToBookInfo = new Map<string, { title: string; authorName?: string }>()

    // Single pass through books to collect both stats and book info
    for (const book of books) {
      if (book.amazonAuthorIds && book.amazonAuthorIds.length > 0) {
        booksWithAuthorIds++
        const authorNames = book.authors || []
        for (let i = 0; i < book.amazonAuthorIds.length; i++) {
          const authorId = book.amazonAuthorIds[i]
          const authorName = authorNames[i]

          authorIdsFromBooks.add(authorId)

          // Only store if we don't have this authorId yet (keep first occurrence)
          if (!authorIdToBookInfo.has(authorId)) {
            authorIdToBookInfo.set(authorId, {
              title: book.title,
              authorName,
            })
          }
        }
      } else {
        booksWithoutAuthorIds++
      }
    }

    // Get set of existing author IDs
    const existingAuthorIds = new Set(authors.map((a) => a.amazonAuthorId))

    // Find missing author IDs and format result
    const missingAuthors: Array<{ authorId: string; sampleBookTitle: string; authorName?: string }> = []

    for (const [authorId, bookInfo] of authorIdToBookInfo.entries()) {
      if (!existingAuthorIds.has(authorId)) {
        missingAuthors.push({
          authorId,
          sampleBookTitle: bookInfo.title,
          authorName: bookInfo.authorName,
        })
      }
    }

    return {
      summary: {
        totalBooks: books.length,
        booksWithAuthorIds,
        booksWithoutAuthorIds,
        uniqueAuthorIdsFound: authorIdsFromBooks.size,
        authorsInDatabase: authors.length,
        missingAuthorIds: missingAuthors.length,
      },
      missingAuthors,
    }
  },
})
