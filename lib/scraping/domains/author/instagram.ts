import type { Page } from 'playwright'
import { collapseWhitespace, normalizeNameForComparison, normalizeTitleForComparison } from '@/lib/awards/import/normalize'
import { navigateWithRetry } from '@/lib/scraping/providers/playwright/browser'
import type { AuthorBookEntry } from './types'

const GOOGLE_SEARCH_URL = 'https://www.google.com/search?hl=en&q='
const GOOGLE_RESULT_LIMIT = 6
const GOOGLE_BOOK_QUERY_LIMIT = 2
const RESERVED_INSTAGRAM_SEGMENTS = new Set([
  'about',
  'accounts',
  'challenge',
  'developer',
  'directory',
  'explore',
  'legal',
  'p',
  'press',
  'reel',
  'reels',
  'stories',
  'tv',
])
const FALSE_POSITIVE_MARKERS = ['fan account', 'fanpage', 'fansite', 'unofficial', 'archive', 'quotes']

export type AuthorInstagramMatch = {
  instagramHandle: string
  instagramUrl: string
  score: number
  query: string
}

type AuthorInstagramCandidate = {
  instagramHandle: string
  instagramUrl: string
  title: string
  snippet: string
  query: string
  rank: number
}

export type ScoredAuthorInstagramCandidate = AuthorInstagramCandidate & {
  score: number
  nameScore: number
  bookScore: number
  handleScore: number
  rankScore: number
  penalty: number
  explicitHandleMention: boolean
}

export async function discoverAuthorInstagram(params: {
  page: Page
  authorName: string
  books: AuthorBookEntry[]
}): Promise<AuthorInstagramMatch | null> {
  const queries = buildGoogleInstagramQueries({
    authorName: params.authorName,
    books: params.books,
  })
  const dedupedCandidates = new Map<string, AuthorInstagramCandidate>()

  console.log(`   🔎 Searching Google for Instagram (${queries.length} queries)`)

  for (const query of queries) {
    const candidates = await searchGoogleInstagramCandidates({
      page: params.page,
      query,
    })

    console.log(`   🔎 Google query "${query}" returned ${candidates.length} Instagram candidates`)

    for (const candidate of candidates) {
      const existing = dedupedCandidates.get(candidate.instagramHandle)
      if (!existing || candidate.rank < existing.rank) {
        dedupedCandidates.set(candidate.instagramHandle, candidate)
      }
    }

    const rankedCandidates = rankAuthorInstagramCandidates({
      authorName: params.authorName,
      books: params.books,
      candidates: [...dedupedCandidates.values()],
    })
    console.log(
      '   🔎 Ranked Instagram candidates:',
      rankedCandidates.map((candidate) => ({
        handle: candidate.instagramHandle,
        score: candidate.score,
        nameScore: candidate.nameScore,
        bookScore: candidate.bookScore,
        explicitHandleMention: candidate.explicitHandleMention,
        rank: candidate.rank,
        title: candidate.title,
      })),
    )
    const match = pickAuthorInstagramCandidate(rankedCandidates)

    if (match) {
      return {
        instagramHandle: match.instagramHandle,
        instagramUrl: match.instagramUrl,
        score: match.score,
        query: match.query,
      }
    }
  }

  return null
}

export function rankAuthorInstagramCandidates(params: {
  authorName: string
  books: AuthorBookEntry[]
  candidates: AuthorInstagramCandidate[]
}): ScoredAuthorInstagramCandidate[] {
  const { authorName, books, candidates } = params

  const rankedCandidates = candidates.map((candidate) => scoreAuthorInstagramCandidate({ authorName, books, candidate }))
  rankedCandidates.sort((left, right) => right.score - left.score)

  return rankedCandidates
}

export function pickAuthorInstagramCandidate(
  candidates: ScoredAuthorInstagramCandidate[],
): ScoredAuthorInstagramCandidate | null {
  const topCandidate = candidates[0]
  const secondCandidate = candidates[1]

  if (!topCandidate) return null
  if (topCandidate.score < 0.7) return null
  if (topCandidate.nameScore < 0.7 && topCandidate.bookScore < 0.55) return null
  if (!topCandidate.explicitHandleMention) return null
  if (!secondCandidate) return topCandidate

  const sameHandle = topCandidate.instagramHandle === secondCandidate.instagramHandle
  if (sameHandle) return topCandidate

  if (topCandidate.score - secondCandidate.score < 0.08) return null

  return topCandidate
}

function buildGoogleInstagramQueries(params: {
  authorName: string
  books: AuthorBookEntry[]
}): string[] {
  const { authorName, books } = params
  const bookTitles = getTopBookTitles(books)
  const queries = [`${authorName} book author instagram site:instagram.com`]

  for (const title of bookTitles) {
    queries.push(`${authorName} ${title} book author instagram site:instagram.com`)
  }

  return [...new Set(queries.map(collapseWhitespace).filter(Boolean))]
}

async function searchGoogleInstagramCandidates(params: {
  page: Page
  query: string
}): Promise<AuthorInstagramCandidate[]> {
  try {
    await navigateWithRetry({
      page: params.page,
      url: `${GOOGLE_SEARCH_URL}${encodeURIComponent(params.query)}`,
      waitMs: 1500,
    })

    await params.page.waitForTimeout(1000)

    const rawCandidates = await params.page.evaluate((limit) => {
      const rawResults: Array<{ href: string; title: string; snippet: string; rank: number }> = []
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))

      for (const anchor of anchors) {
        const href = anchor.getAttribute('href') ?? ''
        if (!href.includes('instagram.com') && !href.startsWith('/url?')) continue

        const title = (anchor.querySelector('h3')?.textContent ?? anchor.textContent ?? '').replace(/\s+/g, ' ').trim()
        const resultRoot =
          anchor.closest('div.MjjYud, div.g, div.tF2Cxc, div[data-snc], div[data-hveid]') ?? anchor.parentElement ?? anchor
        const snippet = (resultRoot.textContent ?? '').replace(/\s+/g, ' ').trim()

        rawResults.push({
          href,
          title,
          snippet,
          rank: rawResults.length + 1,
        })

        if (rawResults.length >= limit * 3) break
      }

      return rawResults
    }, GOOGLE_RESULT_LIMIT)

    const dedupedCandidates = new Map<string, AuthorInstagramCandidate>()

    for (const rawCandidate of rawCandidates) {
      const resolvedInstagramProfile = resolveInstagramProfile(rawCandidate.href)
      if (!resolvedInstagramProfile) continue

      const candidate = {
        instagramHandle: resolvedInstagramProfile.instagramHandle,
        instagramUrl: resolvedInstagramProfile.instagramUrl,
        title: collapseWhitespace(rawCandidate.title),
        snippet: collapseWhitespace(rawCandidate.snippet),
        query: params.query,
        rank: rawCandidate.rank,
      }

      const existing = dedupedCandidates.get(candidate.instagramHandle)
      if (!existing || candidate.rank < existing.rank) {
        dedupedCandidates.set(candidate.instagramHandle, candidate)
      }
    }

    return [...dedupedCandidates.values()].slice(0, GOOGLE_RESULT_LIMIT)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Google search error'
    console.warn(`   ⚠️ Google Instagram search failed: ${message}`)
    return []
  }
}

function scoreAuthorInstagramCandidate(params: {
  authorName: string
  books: AuthorBookEntry[]
  candidate: AuthorInstagramCandidate
}): ScoredAuthorInstagramCandidate {
  const { authorName, books, candidate } = params
  const authorNameNormalized = normalizeNameForComparison(authorName)
  const handleNormalized = normalizeHandleForComparison(candidate.instagramHandle)
  const searchText = normalizeNameForComparison([candidate.title, candidate.snippet, handleNormalized].join(' '))
  const explicitHandleMention = hasExplicitHandleMention(candidate)
  const nameScore = scoreMatchText(authorNameNormalized, searchText)
  const bookScore = getBookScore({
    books,
    searchText,
  })
  const handleScore = scoreMatchText(authorNameNormalized, handleNormalized)
  const rankScore = Math.max(0, 1 - (candidate.rank - 1) * 0.18)
  const penalty = getPenaltyScore(searchText)
  const score = Number(Math.max(0, Math.min(1, nameScore * 0.7 + bookScore * 0.2 + handleScore * 0.05 + rankScore * 0.05 - penalty)).toFixed(4))

  return {
    ...candidate,
    score,
    nameScore: Number(nameScore.toFixed(4)),
    bookScore: Number(bookScore.toFixed(4)),
    handleScore: Number(handleScore.toFixed(4)),
    rankScore: Number(rankScore.toFixed(4)),
    penalty: Number(penalty.toFixed(4)),
    explicitHandleMention,
  }
}

function getTopBookTitles(books: AuthorBookEntry[]): string[] {
  const seenTitles = new Set<string>()
  const titles: string[] = []

  for (const book of books) {
    if (!book.title) continue

    const normalizedTitle = normalizeTitleForComparison(book.title)
    if (!normalizedTitle || seenTitles.has(normalizedTitle)) continue

    seenTitles.add(normalizedTitle)
    titles.push(book.title)

    if (titles.length >= GOOGLE_BOOK_QUERY_LIMIT) break
  }

  return titles
}

function resolveInstagramProfile(href: string): { instagramHandle: string; instagramUrl: string } | null {
  const targetUrl = extractTargetUrlFromGoogleHref(href)
  if (!targetUrl) return null

  let parsedUrl: URL

  try {
    parsedUrl = new URL(targetUrl)
  } catch {
    return null
  }

  if (!parsedUrl.hostname.includes('instagram.com')) return null

  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)
  const instagramHandle = pathSegments[0]

  if (!instagramHandle) return null
  if (RESERVED_INSTAGRAM_SEGMENTS.has(instagramHandle.toLowerCase())) return null
  if (!/^[A-Za-z0-9._]{1,30}$/.test(instagramHandle)) return null

  return {
    instagramHandle,
    instagramUrl: `https://www.instagram.com/${instagramHandle}/`,
  }
}

function extractTargetUrlFromGoogleHref(href: string): string | null {
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href
  }

  if (!href.startsWith('/url?')) return null

  const queryString = href.split('?')[1]
  if (!queryString) return null

  const params = new URLSearchParams(queryString)
  return params.get('q') ?? params.get('url')
}

function normalizeHandleForComparison(handle: string): string {
  return normalizeNameForComparison(handle.replace(/[._]+/g, ' '))
}

function hasExplicitHandleMention(candidate: AuthorInstagramCandidate): boolean {
  const lowerTitle = candidate.title.toLowerCase()
  const lowerSnippet = candidate.snippet.toLowerCase()
  const lowerHandle = candidate.instagramHandle.toLowerCase()

  return (
    lowerTitle.includes(`@${lowerHandle}`) ||
    lowerSnippet.includes(`@${lowerHandle}`) ||
    lowerTitle.includes(`instagram · ${lowerHandle}`) ||
    lowerSnippet.includes(`instagram · ${lowerHandle}`) ||
    lowerTitle.includes(`instagram${lowerHandle}`) ||
    lowerSnippet.includes(`instagram${lowerHandle}`)
  )
}

function scoreMatchText(expected: string, actual: string): number {
  if (!expected || !actual) return 0
  if (actual.includes(expected)) return 1
  if (expected.includes(actual)) return 0.92

  const expectedTokens = expected.split(' ').filter(Boolean)
  const actualTokens = new Set(actual.split(' ').filter(Boolean))

  if (expectedTokens.length === 0) return 0

  let matches = 0

  for (const token of expectedTokens) {
    if (actualTokens.has(token)) matches += 1
  }

  return matches / expectedTokens.length
}

function getBookScore(params: {
  books: AuthorBookEntry[]
  searchText: string
}): number {
  const { books, searchText } = params

  let bestScore = 0

  for (const book of books) {
    if (!book.title) continue

    const normalizedTitle = normalizeTitleForComparison(book.title)
    const score = scoreMatchText(normalizedTitle, searchText)
    if (score > bestScore) {
      bestScore = score
    }
  }

  return bestScore
}

function getPenaltyScore(searchText: string): number {
  for (const marker of FALSE_POSITIVE_MARKERS) {
    if (searchText.includes(marker)) {
      return 0.45
    }
  }

  return 0
}
