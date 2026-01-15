import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

export const create = internalMutation({
  args: {
    url: v.string(),
    adapter: v.string(),
    startedAt: v.number(),
  },
  handler: async (context: any, args: any) => {
    const id = await context.db.insert('bookScrapeRuns', {
      url: args.url,
      adapter: args.adapter,
      status: 'running',
      startedAt: args.startedAt,
    })

    return id
  },
})

export const complete = internalMutation({
  args: {
    scrapeRunId: v.id('bookScrapeRuns'),
    extracted: v.object({
      title: v.optional(v.string()),
      authors: v.optional(v.array(v.string())),
      asin: v.optional(v.string()),
      isbn10: v.optional(v.string()),
      isbn13: v.optional(v.string()),
      coverImageUrl: v.optional(v.string()),
    }),
    finishedAt: v.number(),
  },
  handler: async (context: any, args: any) => {
    await context.db.patch(args.scrapeRunId, {
      status: 'complete',
      extracted: args.extracted,
      finishedAt: args.finishedAt,
    })
  },
})

export const fail = internalMutation({
  args: {
    scrapeRunId: v.id('bookScrapeRuns'),
    errorMessage: v.string(),
    finishedAt: v.number(),
  },
  handler: async (context: any, args: any) => {
    await context.db.patch(args.scrapeRunId, {
      status: 'error',
      errorMessage: args.errorMessage,
      finishedAt: args.finishedAt,
    })
  },
})
