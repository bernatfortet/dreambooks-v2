import type { Page } from 'playwright'
import { parseBookFromPage, ensurePreferredFormat } from '@/lib/scraping/domains/book/parse'
import { navigateWithRetry } from '../browser'
import { truncate, incrementScrapingCount, log } from '../utils'
import { updateBookFromEnrichment, markBookEnrichmentError, type BookToEnrich } from '../convex'

/**
 * Enrich a book with full details from its Amazon page.
 */
export async function enrichBook(params: { book: BookToEnrich; page: Page; dryRun: boolean }): Promise<boolean> {
  const { book, page, dryRun } = params

  const url = book.amazonUrl ?? (book.asin ? `https://www.amazon.com/dp/${book.asin}` : null)

  if (!url) {
    log(`   ⚠️ No URL available for book: ${book.title}`)
    return false
  }

  log(`📖 Enriching: ${truncate(book.title, 50)}`)
  log(`   URL: ${truncate(url, 60)}`)

  const navResult = await navigateWithRetry({ page, url })
  if (!navResult.success) {
    log(`   🚨 Failed to navigate`)
    if (!dryRun) {
      await markBookEnrichmentError(book._id, 'Navigation failed')
    }
    return false
  }

  // Upgrade to preferred format if available (hardcover > paperback > kindle)
  await ensurePreferredFormat(page)

  try {
    const bookData = await parseBookFromPage(page)

    if (!bookData.title) {
      log(`   ⚠️ Failed to extract title`)
      if (!dryRun) {
        await markBookEnrichmentError(book._id, 'Failed to extract title')
      }
      return false
    }

    log(`   ✅ Parsed: ${bookData.title}`)
    log(`   Authors: ${bookData.authors?.join(', ') ?? 'Unknown'}`)
    log(`   ISBN-13: ${bookData.isbn13 ?? 'N/A'}`)

    if (dryRun) {
      log(`   🏁 Would update (dry run)`)
      return true
    }

    await updateBookFromEnrichment(book._id, bookData, url)
    log(`   ✅ Updated in Convex`)

    incrementScrapingCount()

    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log(`   🚨 Error: ${message}`)
    if (!dryRun) {
      await markBookEnrichmentError(book._id, message)
    }
    return false
  }
}
