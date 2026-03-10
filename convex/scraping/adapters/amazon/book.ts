'use node'

import { internalAction } from '../../../_generated/server'
import { v } from 'convex/values'
import { extract } from '@/lib/scraping/providers/firecrawl/client'
import { BookData, BookExtractionResult, bookExtractionSchema, bookExtractionPrompt } from '@/lib/scraping/domains/book/types'
import { parseAgeRange } from '@/lib/utils/age-range'
import { parseGradeLevel } from '@/lib/utils/grade-level'

export const crawlBookWithAmazon = internalAction({
  args: { url: v.string() },
  handler: async (_context, args): Promise<BookData> => {
    console.log('🏁 Starting Amazon book extraction', { url: args.url })

    const result = await extract<BookExtractionResult>({
      url: args.url,
      schema: bookExtractionSchema,
      prompt: bookExtractionPrompt,
    })

    if (!result.success) {
      console.log('🚨 Amazon book extraction failed', { error: result.error })
      throw new Error(`Amazon book extraction failed: ${result.error}`)
    }

    // Normalize undefined to null for consistency
    // Note: Firecrawl extraction can't get amazonAuthorIds or formats from links
    // The extraction schema returns 'ageRange', but BookData uses 'ageRangeRaw'
    const ageRangeRaw = result.data.ageRange ?? null
    const parsedAgeRange = parseAgeRange(ageRangeRaw)
    // Parse grade level similarly
    const gradeLevelRaw = result.data.gradeLevel ?? null
    const parsedGradeLevel = parseGradeLevel(gradeLevelRaw)

    const data: BookData = {
      title: result.data.title ?? null,
      subtitle: null,
      authors: result.data.authors ?? [],
      amazonAuthorIds: [], // Firecrawl can't extract this from links
      contributors: (result.data.authors ?? []).map((name) => ({
        name,
        amazonAuthorId: null, // Firecrawl can't extract author IDs from links
        role: 'author' as const,
      })),
      isbn10: result.data.isbn10 ?? null,
      isbn13: result.data.isbn13 ?? null,
      asin: result.data.asin ?? null,
      publisher: result.data.publisher ?? null,
      publishedDate: result.data.publishedDate ?? null,
      language: null,
      pageCount: result.data.pageCount ?? null,
      description: result.data.description ?? null,
      coverImageUrl: result.data.coverImageUrl ?? null,
      coverWidth: null,
      coverHeight: null,
      coverSourceFormat: null, // Firecrawl can't detect format
      coverSourceAsin: null, // Firecrawl can't detect format
      lexileScore: result.data.lexileScore ?? null,
      ageRangeMin: parsedAgeRange?.min ?? null,
      ageRangeMax: parsedAgeRange?.max ?? null,
      ageRangeRaw,
      gradeLevelMin: parsedGradeLevel?.min ?? null,
      gradeLevelMax: parsedGradeLevel?.max ?? null,
      gradeLevelRaw,
      seriesName: result.data.seriesName ?? null,
      seriesUrl: result.data.seriesUrl ?? null,
      seriesPosition: result.data.seriesPosition ?? null,
      amazonRatingAverage: null, // Firecrawl can't extract ratings
      amazonRatingCount: null,
      goodreadsRatingAverage: null,
      goodreadsRatingCount: null,
      ratingScore: null,
      formats: [], // Firecrawl can't extract format options
      editions: [], // Firecrawl can't extract edition data
      categories: [],
    }

    console.log('✅ Amazon book extraction complete', {
      title: data.title,
      authors: data.authors,
      seriesName: data.seriesName,
    })

    return data
  },
})
