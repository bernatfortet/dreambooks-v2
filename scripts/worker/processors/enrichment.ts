import type { Page } from 'playwright'
import { parseBookFromPage, ensurePreferredFormat } from '@/lib/scraping/domains/book/parse'
import { type PageManager, isClosedError, navigateWithRetry, reconnectPageForRetry, recoverPageIfClosed } from '../browser'
import { truncate, incrementScrapingCount, log } from '../utils'
import { updateBookFromEnrichment, markBookEnrichmentError, type BookToEnrich } from '../convex'

/**
 * Enrich a book with full details from its Amazon page.
 */
export async function enrichBook(params: {
  book: BookToEnrich
  page: Page
  pageManager?: PageManager
  dryRun: boolean
}): Promise<boolean> {
  const { book, page, dryRun } = params

  const url = book.amazonUrl ?? (book.asin ? `https://www.amazon.com/dp/${book.asin}` : null)

  if (!url) {
    log(`   ⚠️ No URL available for book: ${book.title}`)
    return false
  }

  log(`📖 Enriching: ${truncate(book.title, 50)}`)
  log(`   URL: ${truncate(url, 60)}`)

  return await enrichBookAttempt({
    ...params,
    page,
    dryRun,
    attempt: 1,
    url,
  })
}

async function enrichBookAttempt(params: {
  book: BookToEnrich
  page: Page
  pageManager?: PageManager
  dryRun: boolean
  attempt: number
  url: string
}): Promise<boolean> {
  const { book, page, pageManager, dryRun, attempt, url } = params

  try {
    const navResult = await navigateWithRetry({ page, url })
    if (!navResult.success) {
      const recoveredPage =
        navResult.needsReconnect
          ? await reconnectPageForRetry({
              attempt,
              pageManager,
              reason: 'Page closed during enrichment navigation',
            })
          : null

      if (recoveredPage) {
        return await enrichBookAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      log(`   🚨 Failed to navigate`)
      if (!dryRun) {
        await markBookEnrichmentError(book._id, 'Navigation failed')
      }
      return false
    }

    // Upgrade to preferred format if available (hardcover > paperback > kindle)
    await ensurePreferredFormat(page)

    const bookData = await parseBookFromPage(page)

    if (!bookData.title) {
      const recoveredPage = await recoverPageIfClosed({
        attempt,
        page,
        pageManager,
        reason: 'enrichment parsing',
      })

      if (recoveredPage) {
        return await enrichBookAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }

      log(`   ⚠️ Failed to extract title`)
      if (!dryRun) {
        await markBookEnrichmentError(book._id, 'Failed to extract title')
      }
      return false
    }

    log(`   ✅ Parsed: ${bookData.title}`)
    log(`   Authors: ${bookData.authors?.join(', ') ?? 'Unknown'}`)

    if (dryRun) {
      log(`   🏁 Would update (dry run)`)
      return true
    }

    await updateBookFromEnrichment(book._id, bookData, url)
    log(`   ✅ Updated in Convex`)

    incrementScrapingCount()

    return true
  } catch (error) {
    if (isClosedError(error)) {
      const recoveredPage = await reconnectPageForRetry({
        attempt,
        pageManager,
        reason: 'Page closed while enriching book',
      })

      if (recoveredPage) {
        return await enrichBookAttempt({
          ...params,
          page: recoveredPage,
          attempt: attempt + 1,
        })
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    log(`   🚨 Error: ${message}`)
    if (!dryRun) {
      await markBookEnrichmentError(book._id, message)
    }
    return false
  }
}
