import { query } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Get full book data for debugging (includes all fields).
 */
export const inspectBook = query({
  args: {
    id: v.optional(v.id('books')),
    asin: v.optional(v.string()),
  },
  handler: async (context, args) => {
    let book = null

    if (args.id) {
      book = await context.db.get(args.id)
    } else if (args.asin) {
      book = await context.db
        .query('books')
        .withIndex('by_asin', (q) => q.eq('asin', args.asin))
        .unique()
    }

    if (!book) return null

    const coverUrl = book.cover?.storageIdMedium ? await context.storage.getUrl(book.cover.storageIdMedium) : null

    // Get series info if linked
    let seriesInfo: {
      _id: string
      name: string
      coverUrl: string | null
      coverSourceUrl: string | undefined
      coverStorageId: string | undefined
    } | null = null

    if (book.seriesId) {
      // Use query to get proper type inference (db.get returns union type)
      const series = await context.db
        .query('series')
        .filter((q) => q.eq(q.field('_id'), book.seriesId))
        .unique()

      if (series) {
        const seriesCoverUrl = series.coverStorageId ? await context.storage.getUrl(series.coverStorageId) : null
        seriesInfo = {
          _id: series._id,
          name: series.name,
          coverUrl: seriesCoverUrl,
          coverSourceUrl: series.coverSourceUrl,
          coverStorageId: series.coverStorageId,
        }
      }
    }

    // Get latest artifacts for this book
    const artifacts = await context.db
      .query('scrapeArtifacts')
      .withIndex('by_entityId', (q) => q.eq('entityId', book._id))
      .order('desc')
      .take(3)

    // Parse artifact payloads
    const parsedArtifacts = artifacts.map((a) => ({
      _id: a._id,
      adapter: a.adapter,
      scrapeVersion: a.scrapeVersion,
      createdAt: a.createdAt,
      payload: safeParseJson(a.payloadJson),
    }))

    return {
      entity: {
        ...book,
        coverUrl,
      },
      seriesInfo,
      artifacts: parsedArtifacts,
    }
  },
})

/**
 * Sample books to check filter data formats
 */
export const sampleFilterData = query({
  handler: async (context) => {
    const books = await context.db.query('books').order('desc').take(50)

    const samples = books
      .filter((book) => book.ageRange || book.gradeLevel || (book.formats && book.formats.length > 0))
      .slice(0, 10)
      .map((book) => ({
        _id: book._id,
        title: book.title,
        ageRange: book.ageRange,
        gradeLevel: book.gradeLevel,
        formats: book.formats?.map((f) => f.type) || [],
        seriesId: book.seriesId ? 'yes' : 'no',
      }))

    return {
      totalBooks: books.length,
      booksWithFilterData: books.filter((book) => book.ageRange || book.gradeLevel || (book.formats && book.formats.length > 0)).length,
      samples,
    }
  },
})

function safeParseJson(jsonString: string): unknown {
  try {
    return JSON.parse(jsonString)
  } catch {
    return null
  }
}
