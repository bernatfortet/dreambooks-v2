import { withBrowser, navigateWithRetry } from '@/lib/scraping/providers/playwright/browser'
import type { AwardImportAmazonCandidate, NormalizedAwardEntry } from '@/lib/awards/import/types'
import { collapseWhitespace, normalizeNameForComparison, normalizeTitleForComparison } from '@/lib/awards/import/normalize'

export async function searchAmazonBookCandidates(params: {
  entry: NormalizedAwardEntry
  headless: boolean
  limit?: number
}): Promise<AwardImportAmazonCandidate[]> {
  const limit = params.limit ?? 5
  const queries = buildAmazonSearchQueries(params.entry)
  const dedupedCandidates = new Map<string, AwardImportAmazonCandidate>()

  for (const query of queries) {
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=stripbooks`
    const browserResult = await withBrowser({
      config: { headless: params.headless },
      action: async (page) => {
        await navigateWithRetry({
          page,
          url: searchUrl,
        })

        await page.waitForTimeout(1500)

        const rawCandidates = await extractAmazonCandidatesFromPage({
          page,
          limit,
        })

        return rawCandidates
      },
    })

    if (!browserResult.success) {
      if (dedupedCandidates.size > 0) break
      throw new Error(browserResult.error ?? 'Amazon search failed')
    }

    for (const candidate of browserResult.data) {
      const normalizedTitle = normalizeTitleForComparison(candidate.title)
      const normalizedByline = normalizeNameForComparison(candidate.byline ?? '')
      const dedupeKey = `${normalizedTitle}::${normalizedByline}`

      if (dedupedCandidates.has(dedupeKey)) continue

      dedupedCandidates.set(dedupeKey, {
        asin: candidate.asin,
        amazonUrl: candidate.amazonUrl,
        title: collapseWhitespace(candidate.title),
        byline: candidate.byline ? collapseWhitespace(candidate.byline) : undefined,
        rank: candidate.rank,
      })
    }

    if (dedupedCandidates.size > 0) {
      break
    }
  }

  return [...dedupedCandidates.values()]
}

function buildAmazonSearchQueries(entry: NormalizedAwardEntry): string[] {
  const authorNames = entry.author ? collapseWhitespace(entry.author) : ''
  const illustratorNames = entry.illustrator ? collapseWhitespace(entry.illustrator) : ''
  const title = collapseWhitespace(entry.title)
  const creatorNames = authorNames || illustratorNames
  const queries = creatorNames ? [collapseWhitespace([title, creatorNames].filter(Boolean).join(' '))] : [title]

  return [...new Set(queries.filter(Boolean))]
}

async function extractAmazonCandidatesFromPage(params: {
  page: Parameters<Parameters<typeof withBrowser>[0]['action']>[0]
  limit: number
}) {
  const resultLocator = params.page.locator('div[data-component-type="s-search-result"][data-asin]')
  const resultCount = await resultLocator.count()
  const maxResults = Math.min(resultCount, params.limit)
  const candidates: AwardImportAmazonCandidate[] = []

  for (let index = 0; index < maxResults; index += 1) {
    if (candidates.length >= params.limit) break

    const element = resultLocator.nth(index)
    const asin = collapseWhitespace((await element.getAttribute('data-asin', { timeout: 5000 }).catch(() => null)) ?? '')

    if (!asin) continue

    const titleLink = element.locator('h2 a').first()
    const title = collapseWhitespace((await titleLink.textContent({ timeout: 1500 }).catch(() => null)) ?? '')
    const href = await titleLink.getAttribute('href', { timeout: 1500 }).catch(() => null)

    if (!title || !href) continue

    const elementText = collapseWhitespace((await element.textContent({ timeout: 2000 }).catch(() => null)) ?? '')
    const byline = elementText.match(/\bby\s+([^|]+?)(?=\s{2,}|Paperback|Hardcover|Kindle|Audio CD|Mass Market|Library Binding|Board book|$)/i)?.[1]
      ? collapseWhitespace(
          elementText.match(/\bby\s+([^|]+?)(?=\s{2,}|Paperback|Hardcover|Kindle|Audio CD|Mass Market|Library Binding|Board book|$)/i)?.[1] ?? '',
        )
      : undefined

    candidates.push({
      asin,
      amazonUrl: href.startsWith('http') ? href : `https://www.amazon.com${href}`,
      title,
      byline,
      rank: index + 1,
    })
  }

  return candidates
}
