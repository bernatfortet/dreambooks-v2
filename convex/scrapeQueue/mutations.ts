import { mutation, internalMutation } from '../_generated/server'
import { v } from 'convex/values'
import { SCRAPING_CONFIG } from '@/lib/scraping/config'
import { SCRAPE_VERSIONS } from '../lib/scrapeVersions'
import { extractAsin, extractAuthorId, extractSeriesId, normalizeAmazonUrl } from '@/lib/scraping/utils/amazon-url'
import type { DatabaseReader, MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'
import { internal } from '../_generated/api'
import { requireScrapeImportKey } from '../lib/scrapeImportAuth'
import { requireSuperadmin } from '../lib/superadmin'

const LEASE_DURATION_MS = SCRAPING_CONFIG.queue.leaseDurationMs

async function requireQueueAdminAccess(context: MutationCtx, apiKey: string | undefined) {
  if (apiKey) {
    requireScrapeImportKey(apiKey)
    return
  }

  await requireSuperadmin(context)
}

/**
 * URLs that should be skipped (non-book/product pages).
 */
const SKIPPED_URLS = new Set([
  'https://www.amazon.com/dp/B07984JN3L', // Amazon Business credit card
])

/**
 * Check if a URL should be skipped.
 */
function shouldSkipUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    // Check exact match or match by ASIN/product ID
    const normalizedUrl = urlObj.origin + urlObj.pathname
    return SKIPPED_URLS.has(normalizedUrl) || SKIPPED_URLS.has(url)
  } catch {
    return false
  }
}

/**
 * Check if an entity already exists in the database with an up-to-date scrape version.
 * Used to skip enqueueing URLs for entities that don't need re-scraping.
 *
 * @returns object with:
 *   - exists: true if entity exists
 *   - upToDate: true if entity exists AND has current scrape version
 *   - entityId: the ID of the existing entity (if found)
 */
async function checkEntityExists(
  db: DatabaseReader,
  type: 'book' | 'series' | 'author',
  url: string,
): Promise<{ exists: boolean; upToDate: boolean; entityId?: string }> {
  if (type === 'book') {
    const asin = extractAsin(url)
    if (!asin) return { exists: false, upToDate: false }

    // Check bookIdentifiers first (fast O(1) lookup)
    const identifier = await db
      .query('bookIdentifiers')
      .withIndex('by_type_value', (q) => q.eq('type', 'asin').eq('value', asin))
      .unique()

    if (identifier) {
      const book = await db.get(identifier.bookId)
      if (book) {
        const upToDate = (book.scrapeVersion ?? 0) >= SCRAPE_VERSIONS.book
        return { exists: true, upToDate, entityId: book._id }
      }
    }

    // Fallback: check books.by_asin index directly
    const bookByAsin = await db
      .query('books')
      .withIndex('by_asin', (q) => q.eq('asin', asin))
      .unique()

    if (bookByAsin) {
      const upToDate = (bookByAsin.scrapeVersion ?? 0) >= SCRAPE_VERSIONS.book
      return { exists: true, upToDate, entityId: bookByAsin._id }
    }

    return { exists: false, upToDate: false }
  }

  if (type === 'series') {
    const seriesId = extractSeriesId(url)
    if (!seriesId) return { exists: false, upToDate: false }

    const series = await db
      .query('series')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', seriesId))
      .unique()

    if (series) {
      const upToDate = (series.scrapeVersion ?? 0) >= SCRAPE_VERSIONS.series
      return { exists: true, upToDate, entityId: series._id }
    }

    return { exists: false, upToDate: false }
  }

  if (type === 'author') {
    const authorId = extractAuthorId(url)
    if (!authorId) return { exists: false, upToDate: false }

    const author = await db
      .query('authors')
      .withIndex('by_amazonAuthorId', (q) => q.eq('amazonAuthorId', authorId))
      .unique()

    if (author) {
      const upToDate = (author.scrapeVersion ?? 0) >= SCRAPE_VERSIONS.author
      return { exists: true, upToDate, entityId: author._id }
    }

    return { exists: false, upToDate: false }
  }

  return { exists: false, upToDate: false }
}

/**
 * Add a URL to the scrape queue.
 *
 * Skips enqueueing if:
 * 1. URL is blocked
 * 2. URL is already in queue (pending/processing/complete)
 * 3. Entity already exists in DB with up-to-date scrape version (unless forceRescrape=true)
 */
export const enqueue = mutation({
  args: {
    apiKey: v.optional(v.string()),
    url: v.string(),
    type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    displayName: v.optional(v.string()),
    displayImageUrl: v.optional(v.string()),
    scrapeFullSeries: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    source: v.optional(v.union(v.literal('user'), v.literal('discovery'))),
    referrerUrl: v.optional(v.string()),
    referrerReason: v.optional(v.string()),
    forceRescrape: v.optional(v.boolean()), // Skip entity existence check
    skipSeriesLink: v.optional(v.boolean()), // Book: don't upsert/link series
    skipAuthorDiscovery: v.optional(v.boolean()), // Book: don't queue authors
    skipBookDiscoveries: v.optional(v.boolean()), // Series/author: don't queue discovered books
    skipCoverDownload: v.optional(v.boolean()), // All: don't download cover/image
    bookIntakeId: v.optional(v.id('bookIntake')),
  },
  returns: v.union(
    v.object({
      status: v.literal('queued'),
      queueId: v.id('scrapeQueue'),
    }),
    v.object({
      status: v.literal('already_queued'),
      queueId: v.id('scrapeQueue'),
    }),
    v.object({
      status: v.literal('skipped_up_to_date'),
      entityId: v.string(),
    }),
    v.object({
      status: v.literal('blocked'),
    }),
  ),
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    const cleanedUrl = cleanUrl(args.url, true) // Enable URL normalization logging

    // Skip hardcoded URLs (non-book/product pages)
    if (shouldSkipUrl(cleanedUrl)) {
      console.log('🚫 Skipping blocked URL', { url: cleanedUrl })
      return { status: 'blocked' as const }
    }

    // Check if URL is already in queue (any status except error)
    // This prevents re-queuing URLs that are pending, processing, or already completed
    const existing = await context.db
      .query('scrapeQueue')
      .withIndex('by_url', (q) => q.eq('url', cleanedUrl))
      .filter((q) => q.or(q.eq(q.field('status'), 'pending'), q.eq(q.field('status'), 'processing'), q.eq(q.field('status'), 'complete')))
      .first()

    if (existing) {
      console.log('📋 URL already in queue', { url: cleanedUrl, status: existing.status })
      return { status: 'already_queued' as const, queueId: existing._id }
    }

    // Check if entity already exists in DB with up-to-date scrape version
    if (!args.forceRescrape) {
      const entityCheck = await checkEntityExists(context.db, args.type, cleanedUrl)
      if (entityCheck.exists && entityCheck.upToDate) {
        console.log('📋 Entity already exists and up-to-date, skipping', {
          url: cleanedUrl,
          type: args.type,
          entityId: entityCheck.entityId,
        })
        return { status: 'skipped_up_to_date' as const, entityId: entityCheck.entityId! }
      }

      // Entity exists but outdated - log and continue to queue
      if (entityCheck.exists && !entityCheck.upToDate) {
        console.log('📋 Entity exists but outdated, queueing for rescrape', {
          url: cleanedUrl,
          type: args.type,
          entityId: entityCheck.entityId,
        })
      }
    }

    const queueId = await context.db.insert('scrapeQueue', {
      url: cleanedUrl,
      type: args.type,
      status: 'pending',
      priority: args.priority ?? 10,
      displayName: args.displayName,
      displayImageUrl: args.displayImageUrl,
      scrapeFullSeries: args.scrapeFullSeries ?? true,
      source: args.source ?? 'user',
      referrerUrl: args.referrerUrl,
      referrerReason: args.referrerReason,
      skipSeriesLink: args.skipSeriesLink,
      skipAuthorDiscovery: args.skipAuthorDiscovery,
      skipBookDiscoveries: args.skipBookDiscoveries,
      skipCoverDownload: args.skipCoverDownload,
      bookIntakeId: args.bookIntakeId,
      createdAt: Date.now(),
    })

    console.log('📋 Added to scrape queue', { url: cleanedUrl, type: args.type, queueId })

    return { status: 'queued' as const, queueId }
  },
})

/**
 * Mark a queue item as processing.
 * @deprecated Use claimItem instead for safe concurrent processing.
 */
export const markProcessing = mutation({
  args: {
    apiKey: v.optional(v.string()),
    queueId: v.id('scrapeQueue'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    await context.db.patch(args.queueId, {
      status: 'processing',
      startedAt: Date.now(),
    })
    return null
  },
})

/**
 * Atomically claim a queue item for processing.
 * Returns success only if the item is available (pending or lease expired).
 * This prevents double-processing in multi-worker scenarios.
 */
export const claimItem = mutation({
  args: {
    apiKey: v.optional(v.string()),
    queueId: v.id('scrapeQueue'),
    workerId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    const item = await context.db.get(args.queueId)
    if (!item) {
      return { success: false, reason: 'not_found' }
    }

    const now = Date.now()

    // Check if item is available:
    // - pending status, OR
    // - processing status with expired lease
    const isPending = item.status === 'pending'
    const hasExpiredLease = item.status === 'processing' && item.leaseExpiresAt !== undefined && item.leaseExpiresAt < now

    if (!isPending && !hasExpiredLease) {
      return { success: false, reason: 'already_claimed' }
    }

    // Claim the item with a lease
    await context.db.patch(args.queueId, {
      status: 'processing',
      workerId: args.workerId,
      leaseExpiresAt: now + LEASE_DURATION_MS,
      startedAt: now,
      attemptCount: (item.attemptCount ?? 0) + 1,
    })

    return { success: true }
  },
})

/**
 * Mark a queue item as complete.
 */
export const markComplete = mutation({
  args: {
    apiKey: v.optional(v.string()),
    queueId: v.id('scrapeQueue'),
    bookId: v.optional(v.id('books')),
    seriesId: v.optional(v.id('series')),
    authorId: v.optional(v.id('authors')),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    const queueItem = await context.db.get(args.queueId)
    if (!queueItem) return null

    await context.db.patch(args.queueId, {
      status: 'complete',
      bookId: args.bookId,
      seriesId: args.seriesId,
      authorId: args.authorId,
      completedAt: Date.now(),
    })

    if (queueItem.bookIntakeId && args.bookId) {
      await context.runMutation(internal.bookIntake.mutations.attachScrapedBook, {
        intakeId: queueItem.bookIntakeId,
        bookId: args.bookId,
        scrapeQueueId: args.queueId,
      })
    }

    return null
  },
})

/**
 * Mark a queue item as error.
 */
export const markError = mutation({
  args: {
    apiKey: v.optional(v.string()),
    queueId: v.id('scrapeQueue'),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    const queueItem = await context.db.get(args.queueId)
    if (!queueItem) return null

    await context.db.patch(args.queueId, {
      status: 'error',
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    })

    if (queueItem.bookIntakeId) {
      await context.runMutation(internal.bookIntake.mutations.markScrapeFailed, {
        intakeId: queueItem.bookIntakeId,
        scrapeQueueId: args.queueId,
        errorMessage: args.errorMessage,
      })
    }

    return null
  },
})

/**
 * Update preview metadata for a queue item (admin UI).
 * Typically called by the worker after parsing, so queued items can show
 * a title/cover even when the initial enqueue didn't include metadata.
 */
export const updatePreview = mutation({
  args: {
    queueId: v.id('scrapeQueue'),
    displayName: v.optional(v.string()),
    displayImageUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const item = await context.db.get(args.queueId)
    if (!item) return null

    const patch: { displayName?: string; displayImageUrl?: string } = {}

    // Don't override discovery metadata unless empty.
    if (args.displayName && !item.displayName) {
      patch.displayName = args.displayName
    }
    if (args.displayImageUrl && !item.displayImageUrl) {
      patch.displayImageUrl = args.displayImageUrl
    }

    if (Object.keys(patch).length > 0) {
      await context.db.patch(args.queueId, patch)
    }

    return null
  },
})

/**
 * Remove a single item from the queue.
 */
export const remove = mutation({
  args: {
    apiKey: v.optional(v.string()),
    queueId: v.id('scrapeQueue'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    const item = await context.db.get(args.queueId)
    if (!item) return null

    await context.db.delete(args.queueId)
    console.log('📋 Removed from scrape queue', { url: item.url, queueId: args.queueId })

    return null
  },
})

/**
 * Enqueue multiple discoveries at once.
 * Handles deduplication and applies queue safeguards.
 *
 * Skips enqueueing if:
 * 1. URL is blocked
 * 2. URL is already in queue (pending/processing/complete)
 * 3. Entity already exists in DB with up-to-date scrape version
 */
export const enqueueDiscoveries = mutation({
  args: {
    apiKey: v.optional(v.string()),
    discoveries: v.array(
      v.object({
        type: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
        url: v.string(),
        priority: v.number(),
        source: v.string(), // Discovery source description (e.g., 'book-series-link')
        metadata: v.optional(
          v.object({
            name: v.optional(v.string()),
            imageUrl: v.optional(v.string()),
            position: v.optional(v.number()),
          }),
        ),
      }),
    ),
    referrerUrl: v.optional(v.string()), // URL that triggered these discoveries
  },
  returns: v.number(), // Number of items actually queued
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    let queued = 0
    const maxDiscoveries = SCRAPING_CONFIG.queue.maxDiscoveriesPerCall

    // Track skip reasons for logging
    const skipReasons: Record<string, number> = {
      blocked: 0,
      pending: 0,
      processing: 0,
      complete: 0,
      up_to_date: 0, // Entity exists and has current scrape version
    }

    // Cap discoveries to prevent queue floods
    const cappedDiscoveries = args.discoveries.slice(0, maxDiscoveries)

    for (const discovery of cappedDiscoveries) {
      const cleanedUrl = cleanUrl(discovery.url)

      // Skip hardcoded URLs (non-book/product pages)
      if (shouldSkipUrl(cleanedUrl)) {
        skipReasons.blocked++
        continue
      }

      // Check if URL is already in queue (any status except error)
      // This prevents re-queuing URLs that were already completed successfully
      const existing = await context.db
        .query('scrapeQueue')
        .withIndex('by_url', (q) => q.eq('url', cleanedUrl))
        .filter((q) => q.or(q.eq(q.field('status'), 'pending'), q.eq(q.field('status'), 'processing'), q.eq(q.field('status'), 'complete')))
        .first()

      if (existing) {
        skipReasons[existing.status]++
        continue
      }

      // Check if entity already exists in DB with up-to-date scrape version
      const entityCheck = await checkEntityExists(context.db, discovery.type, cleanedUrl)
      if (entityCheck.exists && entityCheck.upToDate) {
        skipReasons.up_to_date++
        continue
      }

      await context.db.insert('scrapeQueue', {
        url: cleanedUrl,
        type: discovery.type,
        status: 'pending',
        priority: discovery.priority,
        displayName: discovery.metadata?.name,
        displayImageUrl: discovery.metadata?.imageUrl,
        scrapeFullSeries: true, // Default to true for discoveries
        source: 'discovery',
        referrerUrl: args.referrerUrl,
        referrerReason: discovery.source, // Use discovery.source as referrerReason
        createdAt: Date.now(),
      })

      queued++
    }

    // Build skip summary
    const skipParts: string[] = []
    if (skipReasons.blocked > 0) skipParts.push(`${skipReasons.blocked} blocked`)
    if (skipReasons.pending > 0) skipParts.push(`${skipReasons.pending} already pending`)
    if (skipReasons.processing > 0) skipParts.push(`${skipReasons.processing} processing`)
    if (skipReasons.complete > 0) skipParts.push(`${skipReasons.complete} already complete`)
    if (skipReasons.up_to_date > 0) skipParts.push(`${skipReasons.up_to_date} up-to-date`)
    const skippedTotal = Object.values(skipReasons).reduce((a, b) => a + b, 0)

    console.log(
      `📋 Queued ${queued} discoveries (${cappedDiscoveries.length} provided, ${args.discoveries.length - cappedDiscoveries.length} capped)` +
        (skippedTotal > 0 ? ` | Skipped: ${skipParts.join(', ')}` : ''),
    )

    return queued
  },
})

/**
 * Clear completed/errored items older than a certain age.
 */
export const clearOld = mutation({
  args: {
    maxAgeMs: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (context, args) => {
    const maxAge = args.maxAgeMs ?? 24 * 60 * 60 * 1000 // 24 hours default
    const cutoff = Date.now() - maxAge

    const oldItems = await context.db
      .query('scrapeQueue')
      .filter((q) => q.and(q.or(q.eq(q.field('status'), 'complete'), q.eq(q.field('status'), 'error')), q.lt(q.field('createdAt'), cutoff)))
      .collect()

    for (const item of oldItems) {
      await context.db.delete(item._id)
    }

    return oldItems.length
  },
})

/**
 * Delete queue items for a URL to allow re-scraping.
 * Useful when fixing scraping bugs and needing to re-scrape entities.
 */
export const deleteQueueItems = mutation({
  args: {
    url: v.string(),
  },
  returns: v.number(),
  handler: async (context, args) => {
    const cleanedUrl = cleanUrl(args.url)

    const existingItems = await context.db
      .query('scrapeQueue')
      .withIndex('by_url', (q) => q.eq('url', cleanedUrl))
      .collect()

    for (const item of existingItems) {
      await context.db.delete(item._id)
    }

    if (existingItems.length > 0) {
      console.log('🗑️ Deleted queue items for re-scraping', {
        url: cleanedUrl,
        count: existingItems.length,
      })
    }

    return existingItems.length
  },
})

/**
 * Recover items with expired leases by setting them back to pending.
 * Called by cron job to handle workers that crashed or timed out.
 */
export const recoverExpiredLeases = internalMutation({
  returns: v.number(),
  handler: async (context) => {
    const now = Date.now()

    // Find all processing items with expired leases
    const expiredItems = await context.db
      .query('scrapeQueue')
      .withIndex('by_status', (q) => q.eq('status', 'processing'))
      .filter((q) => q.and(q.neq(q.field('leaseExpiresAt'), undefined), q.lt(q.field('leaseExpiresAt'), now)))
      .collect()

    // Reset each expired item to pending
    for (const item of expiredItems) {
      await context.db.patch(item._id, {
        status: 'pending',
        workerId: undefined,
        leaseExpiresAt: undefined,
      })

      console.log('🔄 Recovered expired lease', { url: item.url, attemptCount: item.attemptCount })
    }

    if (expiredItems.length > 0) {
      console.log(`🔄 Recovered ${expiredItems.length} expired lease(s)`)
    }

    return expiredItems.length
  },
})

/**
 * Queue an existing entity for re-scraping.
 * Looks up the entity's URL and queues it with optional skip flags.
 * Removes any existing queue entry for the URL to allow re-processing.
 */
export const queueExplicitRescrape = internalMutation({
  args: {
    entityType: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    url: v.string(),
    bookId: v.optional(v.id('books')),
    displayName: v.optional(v.string()),
    displayImageUrl: v.optional(v.string()),
    skipSeriesLink: v.optional(v.boolean()),
    skipAuthorDiscovery: v.optional(v.boolean()),
    skipBookDiscoveries: v.optional(v.boolean()),
    skipCoverDownload: v.optional(v.boolean()),
  },
  returns: v.id('scrapeQueue'),
  handler: async (context, args) => {
    return await queueExplicitRescrapeByUrl(context, args)
  },
})

export const queueRescrape = mutation({
  args: {
    apiKey: v.optional(v.string()),
    entityType: v.union(v.literal('book'), v.literal('series'), v.literal('author')),
    entityId: v.union(v.id('books'), v.id('series'), v.id('authors')),
    skipSeriesLink: v.optional(v.boolean()),
    skipAuthorDiscovery: v.optional(v.boolean()),
    skipBookDiscoveries: v.optional(v.boolean()),
    skipCoverDownload: v.optional(v.boolean()),
  },
  returns: v.id('scrapeQueue'),
  handler: async (context, args) => {
    await requireQueueAdminAccess(context, args.apiKey)

    const entity = await context.db.get(args.entityId)
    if (!entity) throw new Error(`${args.entityType} not found`)

    const { url, displayName, displayImageUrl } = extractEntityInfo(args.entityType, entity)

    if (!url) {
      throw new Error(`${args.entityType} has no source URL - cannot re-scrape`)
    }

    const queueId = await queueExplicitRescrapeByUrl(context, {
      entityType: args.entityType,
      url,
      bookId: args.entityType === 'book' ? (args.entityId as Id<'books'>) : undefined,
      displayName,
      displayImageUrl,
      skipSeriesLink: args.skipSeriesLink,
      skipAuthorDiscovery: args.skipAuthorDiscovery,
      skipBookDiscoveries: args.skipBookDiscoveries,
      skipCoverDownload: args.skipCoverDownload,
    })

    return queueId
  },
})

// --- Helpers ---

/**
 * Clean URL by removing unwanted query parameters and normalizing format.
 * - Decodes HTML entities (&amp; → &)
 * - Removes ref parameters from path (e.g., /ref=xxx at the end)
 * - For author URLs: strips all query params and normalizes slug to lowercase
 * - For series/book URLs (/dp/ASIN): strips all query params
 *
 * Author URL example: /Tim-Probert/e/B08LZGBXFT?qid=123 → /tim-probert/e/B08LZGBXFT
 * Series URL example: /dp/B08911B14Q?binding=paperback&qid=123 → /dp/B08911B14Q
 */
function cleanUrl(url: string, logChanges: boolean = false): string {
  try {
    // Decode HTML entities that may be in URLs from scraped pages
    // &amp; → &, &amp%3B → &
    let cleanedUrl = url.replace(/&amp;/g, '&').replace(/&amp%3B/g, '&')

    // Some scraped hrefs can be relative (e.g. "/dp/ASIN?..."). Normalize to absolute.
    if (cleanedUrl.startsWith('/')) {
      cleanedUrl = `https://www.amazon.com${cleanedUrl}`
    }

    // Use shared Amazon canonicalization to avoid subtle mismatches.
    const normalizedAmazonUrl = normalizeAmazonUrl(cleanedUrl)
    if (normalizedAmazonUrl !== cleanedUrl) {
      if (logChanges) {
        console.log('🔗 URL normalized (amazon)', { original: cleanedUrl, normalized: normalizedAmazonUrl })
      }
      return normalizedAmazonUrl
    }

    const urlObj = new URL(cleanedUrl)

    // Remove ref parameters from path (e.g., /ref=xxx at the end)
    urlObj.pathname = urlObj.pathname.replace(/\/ref=[^/]*$/, '')

    // Check if this is an author URL (pattern: /slug/e/AUTHORID)
    const authorMatch = urlObj.pathname.match(/^\/([^/]+)\/e\/([A-Z0-9]+)$/i)
    if (authorMatch) {
      const originalSlug = authorMatch[1]
      const slug = originalSlug.toLowerCase()
      const authorId = authorMatch[2].toUpperCase() // Keep author ID uppercase for consistency
      urlObj.pathname = `/${slug}/e/${authorId}`

      // Strip all query params for author URLs - ID is in the path
      urlObj.search = ''

      if (logChanges && originalSlug !== slug) {
        console.log('🔗 URL normalized (author slug)', {
          original: `/${originalSlug}/e/${authorId}`,
          normalized: `/${slug}/e/${authorId}`,
        })
      }

      return urlObj.toString()
    }

    // Check if this is a /dp/ASIN URL (series or book)
    const dpMatch = urlObj.pathname.match(/^\/dp\/([A-Z0-9]+)$/i)
    if (dpMatch) {
      // Strip all query params - the ASIN in the path uniquely identifies the entity
      urlObj.search = ''
      return urlObj.toString()
    }

    // For other URLs, only remove specific tracking params
    const paramsToRemove = ['ref', 'ref_', 'binding', 'storeType', 'qid', 'sr']
    for (const param of paramsToRemove) {
      urlObj.searchParams.delete(param)
    }

    return urlObj.toString()
  } catch {
    return url
  }
}

type EntityInfo = {
  url: string | undefined
  displayName: string | undefined
  displayImageUrl: string | undefined
}

async function queueExplicitRescrapeByUrl(
  context: MutationCtx,
  args: {
    entityType: 'book' | 'series' | 'author'
    url: string
    bookId?: Id<'books'>
    displayName?: string
    displayImageUrl?: string
    skipSeriesLink?: boolean
    skipAuthorDiscovery?: boolean
    skipBookDiscoveries?: boolean
    skipCoverDownload?: boolean
  },
) {
  const cleanedUrl = cleanUrl(args.url, true)

  if (shouldSkipUrl(cleanedUrl)) {
    throw new Error('This URL is blocked from being queued')
  }

  const existingItems = await context.db
    .query('scrapeQueue')
    .withIndex('by_url', (q) => q.eq('url', cleanedUrl))
    .collect()

  for (const item of existingItems) {
    await context.db.delete(item._id)
  }

  const queueId = await context.db.insert('scrapeQueue', {
    url: cleanedUrl,
    type: args.entityType,
    status: 'pending',
    priority: 5,
    displayName: args.displayName,
    displayImageUrl: args.displayImageUrl,
    scrapeFullSeries: false,
    source: 'user',
    referrerUrl: cleanedUrl,
    referrerReason: 'rescrape',
    bookId: args.bookId,
    skipSeriesLink: args.skipSeriesLink,
    skipAuthorDiscovery: args.skipAuthorDiscovery,
    skipBookDiscoveries: args.skipBookDiscoveries,
    skipCoverDownload: args.skipCoverDownload,
    createdAt: Date.now(),
  })

  console.log('🔄 Queued for re-scrape', { entityType: args.entityType, url: cleanedUrl, queueId })

  return queueId
}

function extractEntityInfo(entityType: 'book' | 'series' | 'author', entity: Record<string, unknown>): EntityInfo {
  if (entityType === 'book') {
    const cover = entity.cover as { sourceUrl?: string } | undefined
    return {
      url: entity.amazonUrl as string | undefined,
      displayName: entity.title as string | undefined,
      displayImageUrl: cover?.sourceUrl,
    }
  }

  if (entityType === 'series') {
    return {
      url: entity.sourceUrl as string | undefined,
      displayName: entity.name as string | undefined,
      displayImageUrl: entity.coverSourceUrl as string | undefined,
    }
  }

  // Author case
  const image = entity.image as { sourceImageUrl?: string } | undefined
  return {
    url: entity.sourceUrl as string | undefined,
    displayName: entity.name as string | undefined,
    displayImageUrl: image?.sourceImageUrl,
  }
}
