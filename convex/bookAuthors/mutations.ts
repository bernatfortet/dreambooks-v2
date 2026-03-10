import { internalMutation, mutation, type MutationCtx } from '../_generated/server'
import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'

const contributorValidator = v.object({
  name: v.string(),
  amazonAuthorId: v.optional(v.string()),
  role: v.string(),
})

const contributorRoleValidator = v.union(
  v.literal('author'),
  v.literal('illustrator'),
  v.literal('editor'),
  v.literal('translator'),
  v.literal('narrator'),
  v.literal('other'),
)

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
    role: v.optional(contributorRoleValidator),
  },
  returns: v.boolean(),
  handler: async (context, args) => {
    return await insertBookAuthorLink(context, args)
  },
})

/**
 * Link a book to any authors that already exist in the authors table.
 * This closes the gap where books imported after an author was created never got a join row.
 */
export const linkExistingAuthorsForBook = internalMutation({
  args: {
    bookId: v.id('books'),
    authorNames: v.array(v.string()),
    amazonAuthorIds: v.optional(v.array(v.string())),
    contributors: v.optional(v.array(contributorValidator)),
  },
  returns: v.object({
    linkedCount: v.number(),
    matchedAuthorCount: v.number(),
  }),
  handler: async (context, args) => {
    return await linkExistingAuthorsForBookRecord(context, args)
  },
})

/**
 * One-time repair utility for books that were imported before book-author join rows existed.
 */
export const backfillMissingLinksForBooks = internalMutation({
  args: {
    bookIds: v.optional(v.array(v.id('books'))),
  },
  returns: v.object({
    booksScanned: v.number(),
    booksWithNewLinks: v.number(),
    linksCreated: v.number(),
  }),
  handler: async (context, args) => {
    const books = args.bookIds?.length
      ? (
          await Promise.all(args.bookIds.map((bookId) => context.db.get(bookId)))
        ).filter((book): book is Doc<'books'> => book !== null)
      : await context.db.query('books').collect()

    let booksWithNewLinks = 0
    let linksCreated = 0

    for (const book of books) {
      if (book.authors.length === 0 && !book.amazonAuthorIds?.length) continue

      const result = await linkExistingAuthorsForBookRecord(context, {
        bookId: book._id,
        authorNames: book.authors,
        amazonAuthorIds: book.amazonAuthorIds,
        contributors: book.contributors,
      })

      if (result.linkedCount > 0) {
        booksWithNewLinks++
        linksCreated += result.linkedCount
      }
    }

    console.log('✅ Backfilled missing book-author links', {
      booksScanned: books.length,
      booksWithNewLinks,
      linksCreated,
    })

    return {
      booksScanned: books.length,
      booksWithNewLinks,
      linksCreated,
    }
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

async function linkExistingAuthorsForBookRecord(
  context: MutationCtx,
  args: {
    bookId: Id<'books'>
    authorNames: string[]
    amazonAuthorIds?: string[]
    contributors?: Array<{ name: string; amazonAuthorId?: string; role: string }>
  },
) {
  const matchedAuthors = await findExistingAuthorsForBook(context, {
    authorNames: args.authorNames,
    amazonAuthorIds: args.amazonAuthorIds,
  })

  let linkedCount = 0

  for (const author of matchedAuthors) {
    const source = args.amazonAuthorIds?.includes(author.amazonAuthorId) ? 'amazonAuthorId' : 'nameMatch'
    const role = getContributorRoleForAuthor({
      author,
      authorNames: args.authorNames,
      amazonAuthorIds: args.amazonAuthorIds,
      contributors: args.contributors,
    })

    const inserted = await insertBookAuthorLink(context, {
      bookId: args.bookId,
      authorId: author._id,
      source,
      role,
    })

    if (inserted) {
      linkedCount++
    }
  }

  return {
    linkedCount,
    matchedAuthorCount: matchedAuthors.length,
  }
}

async function findExistingAuthorsForBook(
  context: MutationCtx,
  args: {
    authorNames: string[]
    amazonAuthorIds?: string[]
  },
): Promise<Doc<'authors'>[]> {
  const matchedAuthors = new Map<Id<'authors'>, Doc<'authors'>>()

  for (const amazonAuthorId of new Set(args.amazonAuthorIds ?? [])) {
    const author = await context.db
      .query('authors')
      .withIndex('by_amazonAuthorId', (q) => q.eq('amazonAuthorId', amazonAuthorId))
      .unique()

    if (author) {
      matchedAuthors.set(author._id, author)
    }
  }

  for (const authorName of new Set(args.authorNames)) {
    const author = await context.db
      .query('authors')
      .withIndex('by_name', (q) => q.eq('name', authorName))
      .first()

    if (author) {
      matchedAuthors.set(author._id, author)
    }
  }

  const unmatchedNormalizedNames = new Set(
    args.authorNames
      .map(normalizePersonNameForMatch)
      .filter(
        (name) =>
          name &&
          !Array.from(matchedAuthors.values()).some((author) => normalizePersonNameForMatch(author.name) === name),
      ),
  )

  if (unmatchedNormalizedNames.size > 0) {
    const allAuthors = await context.db.query('authors').collect()

    for (const author of allAuthors) {
      const normalizedAuthorName = normalizePersonNameForMatch(author.name)
      if (unmatchedNormalizedNames.has(normalizedAuthorName)) {
        matchedAuthors.set(author._id, author)
      }
    }
  }

  return Array.from(matchedAuthors.values())
}

function getContributorRoleForAuthor(args: {
  author: Doc<'authors'>
  authorNames: string[]
  amazonAuthorIds?: string[]
  contributors?: Array<{ name: string; amazonAuthorId?: string; role: string }>
}): ContributorRole | undefined {
  if (!args.contributors?.length) return undefined

  const normalizedAuthorName = normalizePersonNameForMatch(args.author.name)

  const contributor = args.contributors.find((item) => {
    const hasAmazonId = item.amazonAuthorId === args.author.amazonAuthorId
    const hasExactName = item.name.toLowerCase() === args.author.name.toLowerCase()
    const hasNormalizedName = normalizePersonNameForMatch(item.name) === normalizedAuthorName

    if (args.amazonAuthorIds?.includes(args.author.amazonAuthorId) && hasAmazonId) return true
    if (args.authorNames.includes(args.author.name) && hasExactName) return true
    return hasNormalizedName
  })

  if (!contributor) return undefined
  return toContributorRole(contributor.role)
}

async function insertBookAuthorLink(
  context: MutationCtx,
  args: {
    bookId: Id<'books'>
    authorId: Id<'authors'>
    source: string
    role?: ContributorRole
  },
) {
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
}

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
