'use node'

import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { v } from 'convex/values'
import { Id } from '../_generated/dataModel'
import { SCRAPE_VERSIONS } from '../lib/scrapeVersions'

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
    firstSeenFromUrl: v.optional(v.string()),
    firstSeenReason: v.optional(v.string()),
  },
  handler: async (context, args): Promise<{ authorId: Id<'authors'>; isNew: boolean; booksLinked: number }> => {
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

    // Store the produced object offline for debugging/version comparisons
    await context.runMutation(internal.scraping.artifacts.create, {
      entityType: 'author',
      sourceUrl: args.authorData.sourceUrl ?? '(unknown)',
      adapter: 'playwright-local',
      scrapeVersion: SCRAPE_VERSIONS.author,
      payloadJson: JSON.stringify(args.authorData),
    })

    // Upsert the author
    const result = await context.runMutation(internal.authors.mutations.upsertFromScrape, {
      name: args.authorData.name,
      bio: args.authorData.bio,
      amazonAuthorId: args.authorData.amazonAuthorId,
      sourceUrl: args.authorData.sourceUrl,
      sourceImageUrl: args.authorData.imageUrl,
      scrapeVersion: SCRAPE_VERSIONS.author,
      firstSeenFromUrl: args.firstSeenFromUrl,
      firstSeenReason: args.firstSeenReason,
    })

    // Link existing books that have this amazonAuthorId or author name
    const booksLinked = await context.runMutation(internal.bookAuthors.mutations.linkByAmazonAuthorId, {
      authorId: result.authorId,
      amazonAuthorId: args.authorData.amazonAuthorId,
      authorName: args.authorData.name,
    })

    if (args.authorData.imageUrl) {
      const author = await context.runQuery(internal.authors.queries.getInternal, {
        authorId: result.authorId,
      })

      if (!author?.image?.storageIdMedium) {
        await context.scheduler.runAfter(0, internal.scraping.downloadAuthorImage.downloadAuthorImage, {
          authorId: result.authorId,
          sourceUrl: args.authorData.imageUrl,
        })
      }
    }

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
