'use node'

import { internalAction } from '../../../_generated/server'
import { v } from 'convex/values'
import { extract } from '../../../../lib/scraping/providers/firecrawl/client'
import { BookData, bookExtractionSchema, bookExtractionPrompt } from '../../../../lib/scraping/domains/book/types'

export const crawlBookWithAmazon = internalAction({
  args: { url: v.string() },
  handler: async (_context, args): Promise<BookData> => {
    console.log('🏁 Starting Amazon book extraction', { url: args.url })

    const result = await extract<BookData>({
      url: args.url,
      schema: bookExtractionSchema,
      prompt: bookExtractionPrompt,
    })

    if (!result.success) {
      console.log('🚨 Amazon book extraction failed', { error: result.error })
      throw new Error(`Amazon book extraction failed: ${result.error}`)
    }

    // Normalize undefined to null for consistency
    const data: BookData = {
      title: result.data.title ?? null,
      subtitle: result.data.subtitle ?? null,
      authors: result.data.authors ?? [],
      isbn10: result.data.isbn10 ?? null,
      isbn13: result.data.isbn13 ?? null,
      asin: result.data.asin ?? null,
      publisher: result.data.publisher ?? null,
      publishedDate: result.data.publishedDate ?? null,
      pageCount: result.data.pageCount ?? null,
      description: result.data.description ?? null,
      coverImageUrl: result.data.coverImageUrl ?? null,
      lexileScore: result.data.lexileScore ?? null,
      ageRange: result.data.ageRange ?? null,
      gradeLevel: result.data.gradeLevel ?? null,
      seriesName: result.data.seriesName ?? null,
      seriesUrl: result.data.seriesUrl ?? null,
      seriesPosition: result.data.seriesPosition ?? null,
    }

    console.log('✅ Amazon book extraction complete', {
      title: data.title,
      authors: data.authors,
      seriesName: data.seriesName,
    })

    return data
  },
})
