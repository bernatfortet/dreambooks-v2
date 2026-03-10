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

    const normalizedAuthorName = normalizePersonNameForMatch(args.authorName)

    // Get all books - we need to scan for matching amazonAuthorIds or author names
    const allBooks = await context.db.query('books').collect()

    for (const book of allBooks) {
      const hasAmazonId = book.amazonAuthorIds?.includes(args.amazonAuthorId)
      const hasNameMatch =
        book.authors.some((a) => a.toLowerCase() === args.authorName.toLowerCase()) ||
        book.authors.some((a) => normalizePersonNameForMatch(a) === normalizedAuthorName)

      if (hasAmazonId || hasNameMatch) {
        // Check if link already exists
        const existing = await context.db
          .query('bookAuthors')
          .withIndex('by_bookId_authorId', (q) => q.eq('bookId', book._id).eq('authorId', args.authorId))
          .unique()

        if (!existing) {
          // Look up role from book.contributors if available
          let role: ContributorRole | undefined = undefined
          if (book.contributors) {
            const contributorNameNormalized = normalizePersonNameForMatch(args.authorName)
            const contributor = book.contributors.find(
              (c) =>
                (hasAmazonId && c.amazonAuthorId === args.amazonAuthorId) ||
                (hasNameMatch &&
                  (c.name.toLowerCase() === args.authorName.toLowerCase() ||
                    normalizePersonNameForMatch(c.name) === contributorNameNormalized)),
            )
            if (contributor) {
              role = toContributorRole(contributor.role)
            }
          }

          await context.db.insert('bookAuthors', {
            bookId: book._id,
            authorId: args.authorId,
            source: hasAmazonId ? 'amazonAuthorId' : 'nameMatch',
            role,
            createdAt: Date.now(),
          })
          linkedCount++

          const roleText = role ? ` (${role})` : ''
          console.log(`   📚 Linked book "${book.title}" to author (${hasAmazonId ? 'amazonAuthorId' : 'nameMatch'})${roleText}`)
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
    role: v.optional(
      v.union(
        v.literal('author'),
        v.literal('illustrator'),
        v.literal('editor'),
        v.literal('translator'),
        v.literal('narrator'),
        v.literal('other'),
      ),
    ),
  },
  returns: v.boolean(),
  handler: async (context, args) => {
    // Check if link already exists
    const existing = await context.db
      .query('bookAuthors')
      .withIndex('by_bookId_authorId', (q) => q.eq('bookId', args.bookId).eq('authorId', args.authorId))
      .unique()

    if (existing) {
      return false
    }

    await context.db.insert('bookAuthors', {
      bookId: args.bookId,
      authorId: args.authorId,
      source: args.source,
      role: args.role,
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
      .withIndex('by_bookId_authorId', (q) => q.eq('bookId', args.bookId).eq('authorId', args.authorId))
      .unique()

    if (link) {
      await context.db.delete(link._id)
      return true
    }

    return false
  },
})

type ContributorRole = 'author' | 'illustrator' | 'editor' | 'translator' | 'narrator' | 'other'

function toContributorRole(role: string): ContributorRole {
  if (role === 'author') return 'author'
  if (role === 'illustrator') return 'illustrator'
  if (role === 'editor') return 'editor'
  if (role === 'translator') return 'translator'
  if (role === 'narrator') return 'narrator'
  return 'other'
}

function normalizePersonNameForMatch(name: string): string {
  // Goal: robust matching across scraped bylines like "Mr. Elisha Cooper" vs canonical "Elisha Cooper".
  const lowered = name
    .trim()
    .toLowerCase()
    // Remove punctuation commonly used in honorifics and name suffixes.
    .replace(/[.(),]/g, ' ')
    .replace(/\s+/g, ' ')

  // Strip leading honorific(s).
  const honorifics = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'madam', 'lady', 'lord'])
  const parts = lowered.split(' ').filter(Boolean)

  while (parts.length > 0 && honorifics.has(parts[0])) {
    parts.shift()
  }

  return parts.join(' ').trim()
}
