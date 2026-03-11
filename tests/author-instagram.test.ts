import { describe, expect, test } from 'bun:test'
import { pickAuthorInstagramCandidate, rankAuthorInstagramCandidates } from '@/lib/scraping/domains/author/instagram'

describe('author Instagram ranking', () => {
  test('prefers boltcity for Kazu Kibuishi', () => {
    const rankedCandidates = rankAuthorInstagramCandidates({
      authorName: 'Kazu Kibuishi',
      books: [
        {
          title: 'Amulet',
          asin: null,
          amazonUrl: null,
          coverImageUrl: null,
        },
        {
          title: 'Flight Explorer',
          asin: null,
          amazonUrl: null,
          coverImageUrl: null,
        },
      ],
      candidates: [
        {
          instagramHandle: 'boltcity',
          instagramUrl: 'https://www.instagram.com/boltcity/',
          title: 'Bolt City (@boltcity) • Instagram photos and videos',
          snippet:
            'Kazu Kibuishi. Author and illustrator of the Amulet series, Copper, and the Flight anthologies.',
          query: 'Kazu Kibuishi Amulet instagram site:instagram.com',
          rank: 1,
        },
        {
          instagramHandle: 'amuletfanclub',
          instagramUrl: 'https://www.instagram.com/amuletfanclub/',
          title: 'Amulet Fan Club (@amuletfanclub) • Instagram photos and videos',
          snippet: 'Fan account for readers of Amulet and other fantasy graphic novels.',
          query: 'Kazu Kibuishi Amulet instagram site:instagram.com',
          rank: 2,
        },
        {
          instagramHandle: 'kibuishiquotes',
          instagramUrl: 'https://www.instagram.com/kibuishiquotes/',
          title: 'Kibuishi Quotes (@kibuishiquotes) • Instagram photos and videos',
          snippet: 'Unofficial quote archive celebrating the work of Kazu Kibuishi.',
          query: 'Kazu Kibuishi instagram site:instagram.com',
          rank: 3,
        },
      ],
    })

    expect(rankedCandidates[0]?.instagramHandle).toBe('boltcity')
    expect(pickAuthorInstagramCandidate(rankedCandidates)?.instagramHandle).toBe('boltcity')
  })

  test('returns null when top Instagram matches are too close', () => {
    const rankedCandidates = rankAuthorInstagramCandidates({
      authorName: 'Jane Example',
      books: [
        {
          title: 'Moon Garden',
          asin: null,
          amazonUrl: null,
          coverImageUrl: null,
        },
      ],
      candidates: [
        {
          instagramHandle: 'janeexamplebooks',
          instagramUrl: 'https://www.instagram.com/janeexamplebooks/',
          title: 'Jane Example Books (@janeexamplebooks) • Instagram photos and videos',
          snippet: 'Jane Example writes Moon Garden and other books for children.',
          query: 'Jane Example instagram site:instagram.com',
          rank: 1,
        },
        {
          instagramHandle: 'authorjaneexample',
          instagramUrl: 'https://www.instagram.com/authorjaneexample/',
          title: 'Author Jane Example (@authorjaneexample) • Instagram photos and videos',
          snippet: 'Author of Moon Garden and school visit updates.',
          query: 'Jane Example instagram site:instagram.com',
          rank: 2,
        },
      ],
    })

    expect(pickAuthorInstagramCandidate(rankedCandidates)).toBeNull()
  })

  test('rejects candidates when the extracted handle is not visibly shown in the result', () => {
    const rankedCandidates = rankAuthorInstagramCandidates({
      authorName: 'David Wiesner',
      books: [],
      candidates: [
        {
          instagramHandle: 'popular',
          instagramUrl: 'https://www.instagram.com/popular/',
          title: 'David Wiesner',
          snippet: 'David Wiesner on Instagram.',
          query: 'David Wiesner book author instagram site:instagram.com',
          rank: 18,
        },
      ],
    })

    expect(rankedCandidates[0]?.instagramHandle).toBe('popular')
    expect(pickAuthorInstagramCandidate(rankedCandidates)).toBeNull()
  })
})
