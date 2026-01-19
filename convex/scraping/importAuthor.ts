'use node'

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'

// Validator for scraped author data from local Playwright scraper
const scrapedAuthorDataValidator = v.object({
  name: v.string(),
  bio: v.optional(v.string()),
  amazonAuthorId: v.string(),
  sourceUrl: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
})

/**
 * Public action for importing author data from local Playwright scraper.
 * Requires SCRAPE_IMPORT_KEY environment variable for authentication.
 */
export const importFromLocalScrape = action({
  args: {
    authorData: scrapedAuthorDataValidator,
    apiKey: v.string(),
  },
  handler: async (
    context,
    args
  ): Promise<{ authorId: Id<'authors'>; isNew: boolean; booksLinked: number }> => {
    // Validate API key
    const expectedKey = process.env.SCRAPE_IMPORT_KEY
    if (!expectedKey) {
      throw new Error('SCRAPE_IMPORT_KEY environment variable is not configured')
    }

    if (args.apiKey !== expectedKey) {
      throw new Error('Invalid API key')
    }

    console.log('🏁 Importing author from local scrape', {
      name: args.authorData.name,
      amazonAuthorId: args.authorData.amazonAuthorId,
    })

    // Upsert the author
    const result = await context.runMutation(internal.authors.mutations.upsertFromScrape, {
      name: args.authorData.name,
      bio: args.authorData.bio,
      amazonAuthorId: args.authorData.amazonAuthorId,
      sourceUrl: args.authorData.sourceUrl,
      imageSourceUrl: args.authorData.imageUrl,
    })

    // Link existing books that have this amazonAuthorId or author name
    const booksLinked = await context.runMutation(
      internal.bookAuthors.mutations.linkByAmazonAuthorId,
      {
        authorId: result.authorId,
        amazonAuthorId: args.authorData.amazonAuthorId,
        authorName: args.authorData.name,
      }
    )

    console.log('✅ Author imported', {
      authorId: result.authorId,
      isNew: result.isNew,
      booksLinked,
      name: args.authorData.name,
    })

    return {
      authorId: result.authorId,
      isNew: result.isNew,
      booksLinked,
    }
  },
})
