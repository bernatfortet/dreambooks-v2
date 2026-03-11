import { describe, expect, test } from 'bun:test'
import { pickPreferredCoverFromScrapedData, shouldReplaceStoredCover } from './preferred-cover'

describe('pickPreferredCoverFromScrapedData', () => {
  test('replaces audiobook cover with preferred print edition cover', () => {
    const preferredCover = pickPreferredCoverFromScrapedData({
      coverImageUrl: 'https://example.com/audio.jpg',
      coverWidth: 1500,
      coverHeight: 1500,
      coverSourceFormat: 'audiobook',
      coverSourceAsin: 'AUDIO12345',
      editions: [
        {
          format: 'audiobook',
          asin: 'AUDIO12345',
          amazonUrl: 'https://example.com/audio',
          isbn10: null,
          isbn13: null,
          mainCoverUrl: 'https://example.com/audio.jpg',
          coverWidth: 1500,
          coverHeight: 1500,
        },
        {
          format: 'hardcover',
          asin: 'PRINT12345',
          amazonUrl: 'https://example.com/hardcover',
          isbn10: null,
          isbn13: null,
          mainCoverUrl: 'https://example.com/hardcover.jpg',
          coverWidth: 1200,
          coverHeight: 1800,
        },
      ],
    })

    expect(preferredCover).toEqual({
      coverImageUrl: 'https://example.com/hardcover.jpg',
      coverWidth: 1200,
      coverHeight: 1800,
      coverSourceFormat: 'hardcover',
      coverSourceAsin: 'PRINT12345',
    })
  })

  test('keeps existing preferred cover when editions are not better', () => {
    const preferredCover = pickPreferredCoverFromScrapedData({
      coverImageUrl: 'https://example.com/hardcover.jpg',
      coverWidth: 1200,
      coverHeight: 1800,
      coverSourceFormat: 'hardcover',
      coverSourceAsin: 'PRINT12345',
      editions: [
        {
          format: 'paperback',
          asin: 'PRINT67890',
          amazonUrl: 'https://example.com/paperback',
          isbn10: null,
          isbn13: null,
          mainCoverUrl: 'https://example.com/paperback.jpg',
          coverWidth: 1100,
          coverHeight: 1700,
        },
      ],
    })

    expect(preferredCover).toEqual({
      coverImageUrl: 'https://example.com/hardcover.jpg',
      coverWidth: 1200,
      coverHeight: 1800,
      coverSourceFormat: 'hardcover',
      coverSourceAsin: 'PRINT12345',
    })
  })
})

describe('shouldReplaceStoredCover', () => {
  test('blocks audiobook downgrade when a preferred cover already exists', () => {
    expect(
      shouldReplaceStoredCover({
        existingCoverSourceUrl: 'https://example.com/paperback.jpg',
        existingCoverSourceFormat: 'paperback',
        incomingCoverSourceUrl: 'https://example.com/audio.jpg',
        incomingCoverSourceFormat: 'audiobook',
      }),
    ).toBe(false)
  })

  test('allows upgrades when incoming cover is better', () => {
    expect(
      shouldReplaceStoredCover({
        existingCoverSourceUrl: 'https://example.com/audio.jpg',
        existingCoverSourceFormat: 'audiobook',
        incomingCoverSourceUrl: 'https://example.com/hardcover.jpg',
        incomingCoverSourceFormat: 'hardcover',
      }),
    ).toBe(true)
  })
})
