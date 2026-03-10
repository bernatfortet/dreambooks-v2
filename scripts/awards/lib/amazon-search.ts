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

        const rawCandidates = await page.$$eval(
          'div[data-component-type="s-search-result"][data-asin]',
          (elements, maxResults) => {
            const candidates: Array<{
              asin: string
              amazonUrl: string
              title: string
              byline?: string
              rank: number
            }> = []

            for (const [index, element] of elements.entries()) {
              if (candidates.length >= maxResults) break

              const asin = element.getAttribute('data-asin')?.trim()
              const titleLink =
                (element.querySelector('a.s-line-clamp-2.s-link-style.a-text-normal') as HTMLAnchorElement | null) ??
                (element.querySelector('h2 a') as HTMLAnchorElement | null) ??
                (element.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null)
              const title = titleLink?.textContent?.trim() ?? element.querySelector('h2')?.textContent?.trim()
              const href = titleLink?.href

              if (!asin || !title || !href) continue

              const textNodes = Array.from(element.querySelectorAll('.a-row, .a-size-base, .a-size-small'))
                .map((node) => node.textContent?.trim())
                .filter((value): value is string => Boolean(value))

              const byline = textNodes.find((value) => /^by\s+/i.test(value))?.replace(/^by\s+/i, '')

              candidates.push({
                asin,
                amazonUrl: href.startsWith('http') ? href : `https://www.amazon.com${href}`,
                title,
                byline,
                rank: index + 1,
              })
            }

            return candidates
          },
          limit,
        )

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
  const queries = [
    collapseWhitespace([title, authorNames || illustratorNames].filter(Boolean).join(' ')),
    title,
  ]

  return [...new Set(queries.filter(Boolean))]
}
