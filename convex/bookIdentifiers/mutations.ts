import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { normalizeIdentifier } from '../lib/identifiers'

/**
 * Upsert a book identifier.
 * Deduplicated by (type, value) - if identifier exists for different book, this is a conflict.
 *
 * Returns:
 * - { status: 'created' | 'exists', identifierId }
 * - { status: 'conflict', existingBookId } if identifier points to different book
 */
export const upsert = internalMutation({
  args: {
    bookId: v.id('books'),
    type: v.union(v.literal('asin'), v.literal('isbn10'), v.literal('isbn13')),
    value: v.string(),
    editionId: v.optional(v.id('bookEditions')),
    source: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      status: v.literal('created'),
      identifierId: v.id('bookIdentifiers'),
    }),
    v.object({
      status: v.literal('exists'),
      identifierId: v.id('bookIdentifiers'),
    }),
    v.object({
      status: v.literal('conflict'),
      existingBookId: v.id('books'),
      identifierId: v.id('bookIdentifiers'),
    }),
  ),
  handler: async (context, args) => {
    const normalizedValue = normalizeIdentifier(args.type, args.value)

    // Check for existing identifier
    const existing = await context.db
      .query('bookIdentifiers')
      .withIndex('by_type_value', (q) => q.eq('type', args.type).eq('value', normalizedValue))
      .unique()

    if (existing) {
      if (existing.bookId === args.bookId) {
        // Same book, identifier already exists
        return { status: 'exists' as const, identifierId: existing._id }
      }

      // Different book - this is a conflict (identifier already claimed)
      console.log('⚠️ Identifier conflict', {
        type: args.type,
        value: normalizedValue,
        existingBookId: existing.bookId,
        newBookId: args.bookId,
      })
      return { status: 'conflict' as const, existingBookId: existing.bookId, identifierId: existing._id }
    }

    // Create new identifier
    const identifierId = await context.db.insert('bookIdentifiers', {
      bookId: args.bookId,
      type: args.type,
      value: normalizedValue,
      editionId: args.editionId,
      source: args.source,
      sourceUrl: args.sourceUrl,
      firstSeenAt: Date.now(),
    })

    return { status: 'created' as const, identifierId }
  },
})

/**
 * Delete all identifiers for a book (used when deleting a book).
 */
export const deleteByBookId = internalMutation({
  args: {
    bookId: v.id('books'),
  },
  returns: v.number(),
  handler: async (context, args) => {
    const identifiers = await context.db
      .query('bookIdentifiers')
      .withIndex('by_bookId', (q) => q.eq('bookId', args.bookId))
      .collect()

    for (const identifier of identifiers) {
      await context.db.delete(identifier._id)
    }

    return identifiers.length
  },
})
