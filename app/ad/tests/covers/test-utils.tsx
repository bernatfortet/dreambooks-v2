import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'

type Book = NonNullable<FunctionReturnType<typeof api.books.queries.getBySlugOrId>>

/**
 * Creates a mock book object for testing
 */
export function createMockBook(overrides?: Partial<Book>): Book {
  return {
    _id: 'j1234567890' as Book['_id'],
    _creationTime: Date.now(),
    title: 'Test Book',
    slug: 'test-book',
    authors: ['Test Author'],
    cover: {
      url: 'https://example.com/cover.jpg',
      urlThumb: null,
      urlFull: null,
      width: 200,
      height: 300,
      blurHash: null,
      dominantColor: null,
      sourceUrl: null,
      sourceAsin: null,
      sourceFormat: null,
    },
    ...overrides,
  } as Book
}

/**
 * Test data for different cover scenarios
 */
export const testCovers = {
  portrait: {
    url: 'https://abundant-bee-200.convex.cloud/api/storage/73ff31fe-a3a2-421b-80cc-94f7aa90a085',
    width: 370,
    height: 522,
    aspectRatio: 370 / 522, // ~1.41, treated as landscape (> 1.05)
  },
  landscape: {
    url: 'https://abundant-bee-200.convex.cloud/api/storage/eb5b31c5-b582-4d63-a796-64745fc2efa1',
    width: 1500,
    height: 1156,
    aspectRatio: 1500 / 1156, // ~1.30, treated as landscape (> 1.05)
  },
  truePortrait: {
    url: 'https://abundant-bee-200.convex.cloud/api/storage/73ff31fe-a3a2-421b-80cc-94f7aa90a085',
    width: 370,
    height: 522,
    aspectRatio: 370 / 522, // 0.667, true portrait
  },
} as const
