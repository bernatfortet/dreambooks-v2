import { DatabaseReader } from '../_generated/server'
import { Id } from '../_generated/dataModel'

/**
 * Convert a string to a URL-friendly slug.
 * Pure transformation (duplicates lib/scraping/utils/slug.ts since Convex can't import from lib/)
 *
 * Examples:
 * - "Arnold Lobel" → "arnold-lobel"
 * - "Dr. Seuss" → "dr-seuss"
 * - "Frog & Toad Are Friends" → "frog-and-toad-are-friends"
 */
export function toSlug(text: string): string {
  return text
    .trim()
    .replace(/[&]/g, 'and')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

/**
 * Generate a unique slug for an entity, appending ID suffix if collision exists.
 */
export async function generateUniqueSlug(
  context: { db: DatabaseReader },
  table: 'books' | 'series' | 'authors' | 'awards' | 'publishers',
  name: string,
  entityId: Id<typeof table>,
): Promise<string> {
  const baseSlug = toSlug(name)
  const existing = await context.db
    .query(table)
    .withIndex('by_slug', (q) => q.eq('slug', baseSlug))
    .first()

  if (!existing || existing._id === entityId) {
    return baseSlug
  }

  // Collision: append first 4 chars of ID
  return `${baseSlug}-${entityId.slice(0, 4)}`
}

/**
 * Resolve canonical author name for slug generation.
 * Checks authors table first, falls back to scraped name.
 */
async function resolveAuthorNameForSlug(
  context: { db: DatabaseReader },
  authors: string[],
  amazonAuthorIds: string[] | undefined,
): Promise<string | null> {
  const scrapedName = authors[0] ?? null

  if (amazonAuthorIds?.[0]) {
    const canonicalAuthor = await context.db
      .query('authors')
      .withIndex('by_amazonAuthorId', (q) => q.eq('amazonAuthorId', amazonAuthorIds[0]))
      .first()
    if (canonicalAuthor) {
      return canonicalAuthor.name
    }
  }

  return scrapedName
}

/**
 * Check for slug collision and append ID suffix if needed.
 */
async function ensureUniqueSlug(context: { db: DatabaseReader }, baseSlug: string, bookId: Id<'books'>): Promise<string> {
  const existing = await context.db
    .query('books')
    .withIndex('by_slug', (q) => q.eq('slug', baseSlug))
    .first()

  if (!existing || existing._id === bookId) {
    return baseSlug
  }

  return `${baseSlug}-${bookId.slice(0, 4)}`
}

/**
 * Generate a unique slug for a book, including author name for disambiguation.
 * Uses canonical author name from authors table if available, otherwise falls back to scraped name.
 *
 * Examples:
 * - "Train" by "Elisha Cooper" → "train-elisha-cooper"
 * - "Train" by unknown author → "train"
 */
export async function generateUniqueBookSlug(
  context: { db: DatabaseReader },
  title: string,
  authors: string[],
  amazonAuthorIds: string[] | undefined,
  bookId: Id<'books'>,
): Promise<string> {
  const titleSlug = toSlug(title)
  const authorName = await resolveAuthorNameForSlug(context, authors, amazonAuthorIds)
  const authorSlug = authorName ? toSlug(authorName) : null
  const baseSlug = authorSlug ? `${titleSlug}-${authorSlug}` : titleSlug

  return await ensureUniqueSlug(context, baseSlug, bookId)
}
